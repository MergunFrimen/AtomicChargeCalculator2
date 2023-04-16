import os
import tempfile
import uuid
import zipfile
from collections import defaultdict
from typing import Dict, List, Tuple

from flask import (Response, abort, flash, redirect, render_template, request,
                   send_file, url_for)
from gemmi import cif

from app.parser import parse_txt

from . import application
from .chargefw2 import calculate, get_suitable_methods
from .files import ALLOWED_INPUT_EXTENSION, prepare_example, prepare_file
from .method import method_data, parameter_data

request_data = {}


def prepare_calculations(calculation_list: List[str]) -> Dict[str, List[str]]:
    calculations: Dict[str, List[str]] = defaultdict(list)
    
    for calculation in calculation_list:
        method, parameters = calculation.split(" ")
        calculations[method] += [parameters]

    return calculations


def calculate_charges_default(methods, parameters, tmp_dir: str, comp_id: str) -> None:
    # use first method from suitable methods
    method_name = next(
        method["internal_name"]
        for method in method_data
        if method["internal_name"] in methods
    )

    if method_name in parameters:
        parameters_name = parameters[method_name][0]
    else:
        # This value should not be used as we later check whether the method needs parameters
        parameters_name = None

    # print(f"Using method {method_name} with parameters {parameters_name} for {comp_id}.")

    calculation = {method_name: [parameters_name]}
    calculate_charges(calculation, tmp_dir, comp_id)


def write_all_charges_to_mmcif_output(charges: Dict[str, Dict[Tuple[str, str], List[float]]], output_dir: str, output_filename: str) -> None:
    output_file_path = os.path.join(output_dir, f"{output_filename}.fw2.cif")
    document = cif.read_file(output_file_path)
    block = document.sole_block()

    partial_atomic_charges_meta_prefix = "_partial_atomic_charges_meta."
    partial_atomic_charges_prefix = "_partial_atomic_charges."
    partial_atomic_charges_meta_attributes = ["id", "type", "method"]
    partial_atomic_charges_attributes = ["type_id", "atom_id", "charge"]
    
    block.find_mmcif_category(partial_atomic_charges_meta_prefix).erase()
    block.find_mmcif_category(partial_atomic_charges_prefix).erase()
    
    metadata_loop = block.init_loop(partial_atomic_charges_meta_prefix, partial_atomic_charges_meta_attributes)
    
    for typeId, (method_name, parameters_name) in enumerate(charges[output_filename]):
        method_name = next(
            method["name"]
            for method in method_data
            if method["internal_name"] == method_name
        )
        parameters_name = 'None' if parameters_name == 'NA' else parameters_name
        metadata_loop.add_row([f"{typeId + 1}",
                                "'empirical'",
                                f"'{method_name}/{parameters_name}'"])
                
    charges_loop = block.init_loop(partial_atomic_charges_prefix, partial_atomic_charges_attributes)
    
    for typeId, (method_name, parameters_name) in enumerate(charges[output_filename]):
        chgs = charges[output_filename][(method_name, parameters_name)]
        for atomId, charge in enumerate(chgs):
            # print(typeId, atomId, charge, method_name, parameters_name)
            charges_loop.add_row([f"{typeId + 1}",
                                    f"{atomId + 1}",
                                    f"{charge: .4f}"])

    block.write_file(output_file_path)


def calculate_charges(calculations: Dict[str, List[str]], tmp_dir: str, comp_id: str):
    structures: Dict[str, str] = {}
    logs: Dict[str, str] = {}
    
    input_dir = os.path.join(tmp_dir, "input")
    output_dir = os.path.join(tmp_dir, "output")
    log_dir = os.path.join(tmp_dir, "logs")

    # calculate charges for each structure in input directory
    for input_filename in os.listdir(input_dir):
        charges: Dict[str, Dict[Tuple[str, str], List[float]]] = defaultdict(dict)
        for method_name in calculations:
            for parameters_name in calculations[method_name]:
                input_file_path = os.path.join(input_dir, input_filename)
                
                # run chargefw2
                result = calculate(
                    method_name,
                    parameters_name,
                    input_file_path,
                    output_dir,
                )

                # save stdout and stderr to files
                stdout = result.stdout.decode("utf-8")
                stderr = result.stderr.decode("utf-8")
                with open(os.path.join(log_dir, f"{input_filename}.stdout"), "w") as f_stdout:
                    f_stdout.write(stdout)
                with open(os.path.join(log_dir, f"{input_filename}.stderr"), "w") as f_stderr:
                    f_stderr.write(stderr)

                # save logs
                if stderr.strip():
                    logs["stderr"] = stderr
                if result.returncode != 0:
                    flash("Computation failed. See logs for details.", "error")

                # save charges
                with open(os.path.join(output_dir, f"{input_filename}.txt"), "r") as f:
                    for molecule_name, chgs in parse_txt(f).items():
                        molecule_name = molecule_name.split(":")[1].lower()
                        charges[molecule_name].update({(method_name, parameters_name): chgs})

                # TODO: later generate a single TXT file with all charges
                # rename output TXT files to avoid overwriting them
                os.rename(os.path.join(output_dir, f"{input_filename}.txt"),
                            os.path.join(output_dir, f"{input_filename}_{method_name}_{parameters_name}.txt"))

        # save the mmCIF output file as a string
        for output_filename in list(charges):
            write_all_charges_to_mmcif_output(charges, output_dir, output_filename)
            with open(os.path.join(output_dir, f"{output_filename}.fw2.cif"), "r") as f:
                structures[output_filename.upper()] = f.read()

    # save results to request_data
    request_data[comp_id].update({
        "structures": structures,
        "logs": logs,
    })

    return structures, logs


@application.route("/", methods=["GET", "POST"])
def main_site():
    if request.method == "GET":
        return render_template("index.html")
    
    # POST

    # create temporary directories for computation
    tmp_dir = tempfile.mkdtemp(prefix="compute_")
    # print(f"Created temporary directory {tmp_dir} for computation.")
    for d in ["input", "output", "logs"]:
        os.mkdir(os.path.join(tmp_dir, d))

    # prepare input files
    if request.form["type"] in ["settings", "charges"]:
        if not prepare_file(request, tmp_dir):
            message = "Invalid file provided. Supported types are common chemical formats: sdf, mol2, pdb, cif and zip or tar.gz of those."
            flash(message, "error")
            return render_template("index.html")
    elif request.form["type"] == "example":
        prepare_example(request, tmp_dir)
    else:
        raise RuntimeError("Bad type of input")

    # prepare suitable methods and parameters
    comp_id = str(uuid.uuid1())
    try:
        methods, parameters = get_suitable_methods(tmp_dir)
    except RuntimeError as e:
        flash(f"Error: {e}", "error")
        return render_template("index.html")

    request_data[comp_id] = {
        "tmpdir": tmp_dir,
        "suitable_methods": methods,
        "suitable_parameters": parameters,
    }

    # calculate charges with default method and parameters
    if request.form["type"] in ["charges", "example"]:
        calculate_charges_default(methods, parameters, tmp_dir, comp_id)
        return redirect(url_for("results", r=comp_id))

    return redirect(url_for("setup", r=comp_id))


@application.route("/setup", methods=["GET", "POST"])
def setup():
    comp_id = request.args.get("r")
    try:
        comp_data = request_data[comp_id]
    except KeyError:
        abort(404)

    tmp_dir = comp_data["tmpdir"]
    suitable_methods = comp_data["suitable_methods"]
    suitable_parameters = comp_data["suitable_parameters"]

    if request.method == "GET":
        return render_template(
            "setup.html",
            methods=method_data,
            parameters=parameter_data,
            suitable_methods=suitable_methods,
            suitable_parameters=suitable_parameters,
        )
    
    calculation_list = request.form.getlist("calculation_item")
    calculations = prepare_calculations(calculation_list)

    calculate_charges(calculations, tmp_dir, comp_id)
    
    return redirect(url_for("results", r=comp_id))


@application.route("/results")
def results():
    comp_id = request.args.get("r")
    try:
        comp_data = request_data[comp_id]
    except KeyError:
        abort(404)

    logs = ""
    if "stderr" in comp_data["logs"]:
        logs = comp_data["logs"]["stderr"]
        flash("Some errors occured during the computation, see log for details.")

    return render_template(
        "results.html",
        comp_id=comp_id,
        structures=comp_data["structures"].keys(),
        logs=logs,
    )


# @application.route("/download_pdb")
# def download_pdb():
#     comp_id = request.args.get("r")
#     comp_data = request_data[comp_id]
#     tmpdir = comp_data["tmpdir"]
#     method = comp_data["method"]
#     structure_id = request.args.get("s")

#     return send_file(
#         os.path.join(tmpdir, "output", f"{structure_id}.pdb"),
#         as_attachment=True,
#         download_name=f"{method}_{structure_id}.pdb",
#         max_age=0,
#     )


# TODO: filename
@application.route("/download")
def download_charges():
    comp_id = request.args.get("r")
    comp_data = request_data[comp_id]
    tmpdir = comp_data["tmpdir"]

    with zipfile.ZipFile(os.path.join(tmpdir, "charges.zip"), "w", compression=zipfile.ZIP_DEFLATED) as f:
        for file in os.listdir(os.path.join(tmpdir, "output")):
            f.write(os.path.join(tmpdir, "output", file), arcname=file)

    return send_file(
        f"{tmpdir}/charges.zip",
        as_attachment=True,
        download_name=f"charges.zip",
        max_age=0,
    )


@application.route("/structure")
def get_structure():
    comp_id = request.args.get("r")
    structure_id = request.args.get("s")
    comp_data = request_data[comp_id]

    return Response(comp_data["structures"][structure_id], mimetype="text/plain")


@application.route("/logs")
def get_logs():
    comp_id = request.args.get("r")
    comp_data = request_data[comp_id]

    return Response(comp_data["logs"]["stderr"], mimetype="text/plain")


@application.errorhandler(404)
def page_not_found(error):
    return render_template("404.html"), 404
