from flask import (
    render_template,
    flash,
    request,
    redirect,
    url_for,
    Response,
    abort,
    send_file,
)
from . import application
from typing import Dict, List

import tempfile
import uuid
import os
import zipfile
from glob import glob

from .files import prepare_example, prepare_file
from .method import method_data, parameter_data
from .chargefw2 import calculate, get_suitable_methods


request_data = {}


def update_computation_results(
    method_name: str, parameters_name: str, tmp_dir: str, comp_id: str
):
    structures, logs = calculate_charges(method_name, parameters_name, tmp_dir)
    request_data[comp_id].update(
        {
            "method": method_name,
            "parameters": parameters_name,
            "structures": structures,
            "logs": logs,
        }
    )


def calculate_charges_default(methods, parameters, tmp_dir, comp_id):
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

    update_computation_results(method_name, parameters_name, tmp_dir, comp_id)


def calculate_charges(method_name: str, parameters_name: str, tmp_dir: str):
    structures: Dict[str, str] = {}
    logs: Dict[str, str] = {}
    charges: Dict[str, List[List[int]]] = {}

    # calculate charges for each structure in input directory
    for file in os.listdir(os.path.join(tmp_dir, "input")):
        result = calculate(
            method_name,
            parameters_name,
            os.path.join(tmp_dir, "input", file),
            os.path.join(tmp_dir, "output"),
        )

        stdout = result.stdout.decode("utf-8")
        stderr = result.stderr.decode("utf-8")

        with open(os.path.join(tmp_dir, "logs", f"{file}.stdout"), "w") as f_stdout:
            f_stdout.write(stdout)
        with open(os.path.join(tmp_dir, "logs", f"{file}.stderr"), "w") as f_stderr:
            f_stderr.write(stderr)

        if stderr.strip():
            logs["stderr"] = stderr
        if result.returncode != 0:
            flash("Computation failed. See logs for details.", "error")

    # TODO: get charges from output TXT files and read them into map (structure_name -> charges[])

    # read output files into dictionary
    for output_filename in os.listdir(os.path.join(tmp_dir, "output")):
        if output_filename.endswith(".charges.cif"):
            structure_name = output_filename.split(".")[0].upper()
            with open(os.path.join(tmp_dir, "output", output_filename), "r") as output_file:
                structures.update({structure_name: output_file.read()})
        elif output_filename.endswith(".txt"):
            with open(os.path.join(tmp_dir, "output", output_filename), "r") as output_file:
                c = output_file.read().split('\n')

    # TODO: write charges to 

    return structures, logs


@application.route("/", methods=["GET", "POST"])
def main_site():
    if request.method == "GET":
        return render_template("index.html")

    tmp_dir = tempfile.mkdtemp(prefix="compute_")
    for d in ["input", "output", "logs"]:
        os.mkdir(os.path.join(tmp_dir, d))

    if request.form["type"] in ["settings", "charges"]:
        if not prepare_file(request, tmp_dir):
            message = "Invalid file provided. Supported types are common chemical formats: sdf, mol2, pdb, cif and zip or tar.gz of those."
            flash(message, "error")
            return render_template("index.html")
    elif request.form["type"] == "example":
        prepare_example(request, tmp_dir)
    else:
        raise RuntimeError("Bad type of input")

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

    method_name = request.form.get("method_select")
    parameters_name = request.form.get("parameters_select")
    update_computation_results(method_name, parameters_name, tmp_dir, comp_id)
    
    return redirect(url_for("results", r=comp_id))


@application.route("/results")
def results():
    comp_id = request.args.get("r")
    try:
        comp_data = request_data[comp_id]
    except KeyError:
        abort(404)

    tmpdir = comp_data["tmpdir"]
    filename = glob(os.path.join(tmpdir, "logs", "*.stdout"))[0]
    parameters_name = "None"
    with open(filename) as f:
        for line in f:
            if line.startswith("Parameters:"):
                _, parameters_name = line.split(" ", 1)
                break

    method_name = next(
        m for m in method_data if m["internal_name"] == comp_data["method"]
    )["name"]

    logs = ""
    if "stderr" in comp_data["logs"]:
        logs = comp_data["logs"]["stderr"]
        flash("Some errors occured during the computation, see log for details.")

    return render_template(
        "results.html",
        method_name=method_name,
        comp_id=comp_id,
        parameters_name=parameters_name,
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


@application.route("/download")
def download_charges():
    comp_id = request.args.get("r")
    comp_data = request_data[comp_id]
    tmpdir = comp_data["tmpdir"]
    method = comp_data["method"]

    with zipfile.ZipFile(
        os.path.join(tmpdir, "charges.zip"), "w", compression=zipfile.ZIP_DEFLATED
    ) as f:
        for file in os.listdir(os.path.join(tmpdir, "output")):
            f.write(os.path.join(tmpdir, "output", file), arcname=file)

    return send_file(
        f"{tmpdir}/charges.zip",
        as_attachment=True,
        download_name=f"{method}_charges.zip",
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
