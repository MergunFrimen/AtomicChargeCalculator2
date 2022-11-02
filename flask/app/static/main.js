'use strict';


const spinner = '<span class="spinner-border spinner-border-sm" role="status" ' +
    'aria-hidden="true" style="animation-duration: 1.5s"></span>';


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
        disable_buttons();
        $(this).html(`${spinner} Computing...`);
        $('#example-name').val($(this).prop('name'));
        $('form').submit();
    });

    $settings.on('click', function (e) {
        if ($input[0].files[0].size > 10 * 1024 * 1024) {
            alert('Cannot upload file larger than 10 MB');
            e.preventDefault();
        } else {
            disable_buttons();
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


const minCharge = -1, maxCharge = 1;
let representationStyle = {
    sequence: {
        kind: 'cartoon',
        coloring: 'partial-charges',
        colorParams: { absolute: false, minCharge: minCharge, maxCharge: maxCharge } },
    hetGroups: {
        kind: 'ball-and-stick',
        coloring: 'partial-charges',
        colorParams: { absolute: false, minCharge: minCharge, maxCharge: maxCharge } },
    water: { hide: true }
};

function changeRange(min, max) {
    // min = parseFloat(parseFloat(min).toFixed(2));
    // max = parseFloat(parseFloat(max).toFixed(2));
    min = parseFloat(parseFloat(min));
    max = parseFloat(parseFloat(max));
    representationStyle.sequence.colorParams.minCharge = min;
    representationStyle.hetGroups.colorParams.minCharge = min;
    representationStyle.sequence.colorParams.maxCharge = max;
    representationStyle.hetGroups.colorParams.maxCharge = max;
}

function absolute() {
    representationStyle.sequence.colorParams.absolute = true;
    representationStyle.hetGroups.colorParams.absolute = true;
    representationStyle.sequence.coloring = 'partial-charges';
    representationStyle.hetGroups.coloring = 'partial-charges';
}

function relative() {
    representationStyle.sequence.colorParams.absolute = false;
    representationStyle.hetGroups.colorParams.absolute = false;
    representationStyle.sequence.coloring = 'partial-charges';
    representationStyle.hetGroups.coloring = 'partial-charges';
}

function updateViewer() {
    PluginWrapper.updateStyle({ ...representationStyle });
}


async function init_results() {
    const $select = $('#structure_select');
    let $min_value = $('#min_value');
    let $max_value = $('#max_value');

    // initialize viewer
    await PluginWrapper.init('root');

    // react to selected structure
    $select.on('changed.bs.select', () => {
        const id = $select.val();
        const url = 'http://localhost' + get_structure_url + `&s=${id}`;
        const background = 0x000000;

        PluginWrapper.load({ url, representationStyle });
        PluginWrapper.setBackground(background);

        if (chg_range.hasOwnProperty(id)) {
            $('input:radio[name=colors]').prop('disabled', false);
        } else {
            $('input:radio[name=colors][value="Structure"]').prop('checked', true);
            $('input:radio[name=colors]').prop('disabled', true);
            $min_value.val(0);
            $max_value.val(0);
        }

        if ($('input[name=colors]:checked').val() === 'Relative') {
            $min_value.val(-chg_range[id]);
            $max_value.val(chg_range[id]);
            $min_value.trigger('input');
        }
    });

    // update absolute charges
    $('#min_value, #max_value').on('input', () => {
        changeRange($min_value.val(), $max_value.val());
        console.log(representationStyle.sequence.colorParams.minCharge);
        console.log(representationStyle.sequence.colorParams.maxCharge);

        $min_value.attr('max', $max_value.val());
        $max_value.attr('min', $min_value.val());

        updateViewer();
    });

    // change color
    let $colors = $('input[name=colors]');
    $colors.on('change', () => {
        let coloring = $('input[name=colors]:checked').val();
        
        if (coloring === 'Relative') {    
            relative();
            
            const id = $select.val();
            $min_value.val(-chg_range[id]);
            $max_value.val(chg_range[id]);

            $min_value.prop('disabled', true);
            $max_value.prop('disabled', true);

        } else if (coloring === 'Absolute') {
            absolute();

            $min_value.prop('disabled', false);
            $max_value.prop('disabled', false);
            // TODO: wtf does this do?
            $min_value.trigger('input');

        } else if (coloring === 'Structure') {
            representationStyle.sequence.coloring = 'element-symbol';
            representationStyle.hetGroups.coloring = 'element-symbol';
        }

        updateViewer();
    });

    // change structure
    let $view = $('input[name=view]');
    $view.on('change', () => {        
        const repr = $('input[name=view]:checked').val();
        
        if (repr === 'Cartoon') {
            representationStyle.sequence.kind = 'cartoon';
            representationStyle.hetGroups.kind = 'ball-and-stick';
        } else if (repr === 'Balls and sticks') {
            representationStyle.sequence.kind = 'ball-and-stick';
            representationStyle.hetGroups.kind = 'ball-and-stick';
        } else if (repr === 'Surface') {
            representationStyle.sequence.kind = 'molecular-surface';
            representationStyle.hetGroups.kind = 'molecular-surface';
        }

        updateViewer();
    });

    $select.trigger('changed.bs.select');
    $colors.filter(':checked').trigger('change');

    // TODO: add function to molstar for retrieving current visualization mode
    /* Change the state of a radio button to reflect view LiteMol chooses when it loads a molecule */
    // LiteMolChargesViewerEventQueue.subscribe("lm-visualization-mode-changed", (event_info) => {
    //     if (event_info.mode === 'balls-and-sticks') {
    //         $('input:radio[name=view][value="Balls and sticks"]').prop('checked', true);
    //     } else if (event_info.mode === 'cartoons') {
    //         $('input:radio[name=view][value="Cartoon"]').prop('checked', true);
    //     }
    // });
}


$(function () {
    let pathname = window.location.pathname;
    if (pathname === '/') {
        init_index();
    } else if (pathname === '/setup') {
        $.getJSON('/static/publication_info.json', function (data) {
            init_setup(data);
        });
    } else if (pathname === '/results') {
        init_results();
    }
});
