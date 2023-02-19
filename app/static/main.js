'use strict';

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
    const $buttons = $('.btn');
    $buttons.each(function () {
        $(this).prop('disabled', true);
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
        // $(this).html(`${spinner} Computing...`);
        $('#example-name').val($(this).prop('name'));
        $('form').submit();
    });

    $settings.on('click', function (e) {
        if ($input[0].files[0].size > 10 * 1024 * 1024) {
            alert('Cannot upload file larger than 10 MB');
            e.preventDefault();
        } else {
            // disable_buttons();
            // $settings.html(`${spinner} Uploading...`);
            $('#type').val('settings');
            $('form').submit();
        }
    });

    $charges.on('click', function (e) {
        if ($input[0].files[0].size > 10 * 1024 * 1024) {
            alert('Cannot upload file larger than 10 MB');
            e.preventDefault();
        } else {
            disable_buttons();
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

        $('.selectpicker').selectpicker('refresh');
    });

    $m_select.trigger('change');

    const $submit = $('#calculate');
    $submit.on('click', function () {
        disable_buttons();
        $submit.html(`${spinner} Computing...`);
        $submit.prop('disabled', true);
        $('form').submit();
    });
}


function update_litemol_colors(min_color, max_color) {
    LiteMolChargesViewerEventQueue.send("lm-set-default-color-scheme", {
        minVal: min_color,
        maxVal: max_color,
        fallbackColor: {r: 0, g: 255, b: 0},
        minColor: {r: 255, g: 0, b: 0},
        maxColor: {r: 0, g: 0, b: 255},
        middleColor: {r: 255, g: 255, b: 255}
    });
}

let molstar;

function init_results() {
    (async () => {
        molstar = await MolstarPartialCharges.create("root");
        await load();
        await updateRelativeColor();
        mountControls();
    })().then(
        () => {},
        (error) => {
            console.error("Mol* initialization ❌", error);
        }
    );
}

// TODO: add function to set color and view on structure switch
// it should keep the view and color of the previous structure
// only initial load should set default view and color
async function load() {
    const selection = document.getElementById('structure_select');
    const cartoon = document.getElementById("view_cartoon");
    const bas = document.getElementById("view_bas");
    if (!selection || !cartoon || !bas) return;
    const id = selection.value;
    const structure_url = `${get_structure_url}&s=${id}`;

    await molstar.load(structure_url);
    
    if (molstar.type.isDefaultApplicable()) {
        cartoon.removeAttribute('disabled');
        await molstar.type.default();
    } else {
        cartoon.setAttribute('disabled', true);
        await molstar.type.ballAndStick();
    }
}

function mountControls() {
    mountStructureControls();
    mountTypeControls();
    mountColorControls();
}

function mountStructureControls() {
    const selection = document.getElementById('structure_select');
    if (!selection) return;
    selection.onchange = async () => await load();
}

function mountTypeControls() {
    const cartoon = document.getElementById("view_cartoon");
    const surface = document.getElementById("view_surface");
    const bas = document.getElementById("view_bas");
    if (!cartoon || !surface || !bas) return;
    cartoon.onclick = async () => await molstar.type.default();
    surface.onclick = async () => await molstar.type.surface();
    bas.onclick = async () => await molstar.type.ballAndStick();
}

function mountColorControls() {
    const structure = document.getElementById("colors_structure");
    const relative = document.getElementById("colors_relative");
    const absolute = document.getElementById("colors_absolute");
    const range = document.getElementById("max_value");
    if (!structure || !relative || !absolute) return;
    structure.onclick = async () => await updateDefaultColor();
    relative.onclick = async () => await updateRelativeColor();
    absolute.onclick = async () => await updateAbsoluteColor();
    range.oninput = async () => await updateRange();
}

async function updateDefaultColor() {
    const input = document.getElementById("max_value");
    if (!input) return;
    input.setAttribute("disabled", "true");
    await molstar.color.default();
}

async function updateRelativeColor() {
    const button = document.getElementById("colors_relative");
    const input = document.getElementById("max_value");
    if (!button || !input) return;
    input.setAttribute("disabled", "true");
    const charge = await molstar.charges.getRelativeCharge();
    input.value = charge.toFixed(3);
    await molstar.color.relative();
}

async function updateAbsoluteColor() {
    const input = document.getElementById("max_value");
    if (!input) return;
    input.removeAttribute("disabled");
    await molstar.color.relative();
}

async function updateRange() {
    const input = document.getElementById("max_value");
    if (!input) return;
    const value = Number(input.value);
    if (isNaN(value)) return;
    if (value > input.max) input.value = input.max;
    if (value < input.min) input.value = input.min;
    await molstar.color.absolute(value);
}


$(function () {
    let page = window.location.pathname;
    if (page === '/') {
        init_index();
    } else if (page === '/setup') {
        $.getJSON('/static/publication_info.json', function (data) {
            init_setup(data);
        });
    } else if (page === '/results') {
        init_results();
    }
});
