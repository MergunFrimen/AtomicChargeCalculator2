'use strict';


const spinner = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true" style="animation-duration: 1.5s">\
                    <span class="sr-only">Loading...</span>\
                </span>';


function fill_paper($element, publication_data, doi) {
    if (doi === null) {
        $element.html('None');
    } else if (doi in publication_data) {
        $element.html(publication_data[doi].replace(/doi:(.*)/, '<a href="https://doi.org/$1">doi:$1</a>'));
    } else {
        $element.html(`<a href="https://doi.org/${doi}">${doi}</a>`);
    }
}


function hide_parameters_publication(val) {
    $('#parameters_paper').prop('hidden', val);
    $('#parameters_paper_label').prop('hidden', val);
}


function disable_buttons() {
    const buttons = document.querySelectorAll('.btn');
    buttons.forEach((button) => {
        button.setAttribute('disabled', true);
    });
}


function init_index() {
    /* Allow submit only if file is selected */
    const $input = $('#file_input');
    const $settings = $('#settings');
    const $charges = $('#charges');
    const $examples = $('button[name^="example"]');

    $settings.prop('disabled', true);
    $charges.prop('disabled', true);

    $input.on('change', function () {
        if ($input.val()) {
            $settings.prop('disabled', false);
            $charges.prop('disabled', false);
        } else {
            $settings.prop('disabled', true);
            $charges.prop('disabled', true);
        }
    });

    $examples.on('click', function () {
        // disable_buttons();
        $(this).html(`${spinner} Computing...`);
        $('#example-name').val($(this).prop('name'));
        $('form').submit();
    });

    $settings.on('click', function (e) {
        if ($input[0].files[0].size > 10 * 1024 * 1024) {
            alert('Cannot upload file larger than 10 MB');
            e.preventDefault();
        } else {
            // disable_buttons();
            $settings.html(`${spinner} Uploading...`);
            $('#type').val('settings');
            $('form').submit();
        }
    });

    $charges.on('click', function (e) {
        if ($input[0].files[0].size > 10 * 1024 * 1024) {
            alert('Cannot upload file larger than 10 MB');
            e.preventDefault();
        } else {
            // disable_buttons();
            $charges.html(`${spinner} Computing...`);
            $('#type').val('charges');
            $('form').submit();
        }
    });

    /* Fix disabled buttons when user press Back button in browser (at least in Chrome) */
    $input.trigger('change');
}


function init_setup(publication_data) {
    const $m_select = $('#method_selection');
    const $m_group2d = $('#optgroup2D');
    const $m_group3d = $('#optgroup3D');
    const $p_select = $('#parameters_selection');

    /* Set available methods */
    for (const method of suitable_methods) {
        const data = method_data.find(m => m.internal_name === method);
        const str = `<option value="${data.internal_name}">${data.name}</option>\n`;
        if (data.type === "2D")
            $m_group2d.append(str);
        else if (data.type === "3D")
            $m_group3d.append(str);
        else
            $m_select.append(str);
    }

    /* Update parameter publication on change */
    $p_select.on('change', function () {
        const m_name = $('#method_selection option:selected').val();
        const p_name = $('#parameters_selection option:selected').text();

        const e = parameter_data[m_name].find(function (element) {
            return element.name === p_name;
        });

        fill_paper($('#parameters_paper'), publication_data, e.publication);
    });

    /* Update method data on method select change */
    $m_select.on('change', function () {
        const m_name = $('#method_selection option:selected').val();
        const e = method_data.find(function (element) {
            return element.internal_name === m_name;
        });

        $p_select.empty();
        if (e.has_parameters) {
            let p_options = '';
            $p_select.prop('disabled', false);
            for (const parameters of suitable_parameters[m_name]) {
                const parameter_set = parameter_data[m_name].find(p => p.filename === parameters);
                p_options += `<option value="${parameter_set.filename}">${parameter_set.name}</option>\n`;
            }

            $p_select.append(p_options);
            hide_parameters_publication(false);
            $p_select.trigger('change');
        } else {
            $p_select.prop('disabled', true);
            $p_select.append('<option value="NA">No parameters<option>');
            hide_parameters_publication(true);
        }

        $('#method_name').text(e.full_name);

        fill_paper($('#method_paper'), publication_data, e.publication);

        // TODO: fix update of citations
        $('.selectpicker').selectpicker('refresh');
    });

    $m_select.trigger('change');

    // TODO: fix spinner not working
    const $submit = $('#calculate');
    $submit.on('click', function () {
        disable_buttons();
        $submit.html(`${spinner} Computing...`);
        $submit.prop('disabled', true);
        $('form').submit();
    });
}

let molstar;
let typeId = 1;

function init_results() {
    (async () => {
        molstar = await MolstarPartialCharges.create("root");
        mountControls();
        await load();
        // doesn't work before load
        await mountChargeSetControls();
    })().then(
        () => {},
        (error) => {
            console.error("Mol* initialization ❌", error);
        }
    );
}

// TODO: add state for color and type
async function load() {
    const selection = document.getElementById('structure_select');
    const cartoon = document.getElementById("view_cartoon");
    const bas = document.getElementById("view_bas");
    const relative = document.getElementById("colors_relative");
    if (!selection || !cartoon || !bas || !relative) {
        console.error("Controls not found");
        return;
    }
    const id = selection.value;
    const structure_url = `${get_structure_url}&s=${id}`;

    await molstar.load(structure_url);
    await molstar.charges.setTypeId(typeId);

    if (molstar.type.isDefaultApplicable()) {
        cartoon.removeAttribute('disabled');
        cartoon.click();
    } else {
        cartoon.setAttribute('disabled', true);
        bas.click();
    }

    relative.click();
}

function mountControls() {
    mountStructureControls();
    mountTypeControls();
    mountColorControls();
}

function mountStructureControls() {
    const selection = document.getElementById('structure_select');
    if (!selection) {
        console.error("Structure select not found");
        return;
    }
    selection.onchange = async () => await load();
}

async function mountChargeSetControls() {
    const select = document.getElementById('charge_set_select');
    if (!select) {
        console.error("Charge set select not found");
        return;
    }
    const options = molstar.charges.getMethodNames();
    for (let i = 0; i < options.length; ++i) {
        const option = document.createElement('option');
        option.value = `${i + 1}`;
        option.innerText = options[i];
        option.selected = i + 1 === typeId;
        select.appendChild(option);
    }
    select.onchange = async () => {
        const options = molstar.charges.getMethodNames();
        const method_name = document.getElementById('method_name');
        const parameters_name = document.getElementById('parameters_name');
        if (!options || !method_name || !parameters_name) {
            console.error("Method or parameters name not found");
            return;
        }

        typeId = Number(select.value);
        await molstar.charges.setTypeId(typeId);
        await updateRelativeColor();

        // method_name.innerText = molstar.charges.getMethodName(typeId);
        // parameters_name.innerText = molstar.charges.getParametersName(typeId);
    }
}

function mountTypeControls() {
    const cartoon = document.getElementById("view_cartoon");
    const surface = document.getElementById("view_surface");
    const bas = document.getElementById("view_bas");
    if (!cartoon || !surface || !bas) {
        console.error("Type controls not found");
        return;
    }
    cartoon.onclick = async () => await molstar.type.default();
    surface.onclick = async () => await molstar.type.surface();
    bas.onclick = async () => await molstar.type.ballAndStick();
}

function mountColorControls() {
    const structure = document.getElementById("colors_structure");
    const relative = document.getElementById("colors_relative");
    const absolute = document.getElementById("colors_absolute");
    const range = document.getElementById("max_value");
    if (!structure || !relative || !absolute) {
        console.error("Color controls not found");
        return;
    }
    structure.onclick = async () => await updateDefaultColor();
    relative.onclick = async () => await updateRelativeColor();
    absolute.onclick = async () => await updateAbsoluteColor();
    range.oninput = async () => await updateRange();
}

async function updateDefaultColor() {
    const input = document.getElementById("max_value");
    if (!input) {
        console.error("Max value input not found");
        return;
    }
    input.setAttribute("disabled", "true");
    await molstar.color.default();
}

async function updateRelativeColor() {
    const input = document.getElementById("max_value");
    if (!input) {
        console.error("Max value input not found");
        return;
    }
    input.setAttribute("disabled", "true");
    const charge = await molstar.charges.getRelativeCharge();
    input.value = charge.toFixed(3);
    await molstar.color.relative();
}

async function updateAbsoluteColor() {
    const input = document.getElementById("max_value");
    if (!input) {
        console.error("Max value input not found");
        return;
    }
    input.removeAttribute("disabled");
    await molstar.color.relative();
}

async function updateRange() {
    const input = document.getElementById("max_value");
    if (!input) {
        console.error("Max value input not found");
        return;
    }
    const value = Number(input.value);
    if (isNaN(value)) return;
    if (value > input.max) input.value = input.max;
    if (value < input.min) input.value = input.min;
    await molstar.color.absolute(value);
}

function mountAddCalculationControls() {
    const method_selection = document.getElementById('method_selection');
    const parameters_selection = document.getElementById('parameters_selection');
    const button = document.getElementById('add_to_calculation');
    const list = document.getElementById('calculation_list');
    
    if (!method_selection || !parameters_selection || !button || !list) {
        console.error('Missing elements');
        return;
    }

    button.onclick = () => {
        const method = method_selection.value;
        const parameters = parameters_selection.value;
        const name = method_selection.options[method_selection.selectedIndex].text;
        const parameters_name = parameters_selection.options[parameters_selection.selectedIndex].text;
                
        if (checkUniqueList(list, method, parameters)) {
            list.appendChild(createListItem(name, parameters_name, method, parameters));
        }
    }
}

function checkUniqueList(list, method, parameters) {
    for (let i = 0; i < list.children.length; ++i) {
        const item = list.children[i];
        if (item.dataset.method === method && item.dataset.parameters === parameters) {
            return false;
        }
    }
    return true;
}

function checkListCount(list) {
    return list.children.length > 0;
}

function createListItem(method_name, parameters_name, method, parameters) {
    const item = document.createElement('li');
    item.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
    item.innerText = `${method_name} (${parameters_name})`;
    item.dataset.method = method;
    item.dataset.parameters = parameters;
    console.log(method, parameters)
    item.appendChild(createInput('calculation_item', method, parameters));
    item.appendChild(createRemoveButton());

    return item;
}

function createInput(name, method, parameters) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = `${method} ${parameters}`;
    return input;
}

function createRemoveButton() {
    const button = document.createElement('button');
    button.classList.add('btn', 'btn-sm', 'p-0');
    button.type = 'button';
    const icon = document.createElement('i');
    icon.classList.add('bi', 'bi-x-circle-fill');
    button.appendChild(icon);

    button.onclick = () => {
        const item = button.parentElement;
        item.parentElement.removeChild(item);
    }
    
    return button;
}


$(function () {
    let page = window.location.pathname;
    if (page === '/') {
        init_index();
    } else if (page === '/setup') {
        $.getJSON('/static/publication_info.json', function (data) {
            init_setup(data);
        });
        mountAddCalculationControls();
    } else if (page === '/results') {
        init_results();
    }
});
