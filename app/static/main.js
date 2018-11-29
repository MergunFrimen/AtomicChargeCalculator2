'use strict';

function fill_paper(element, doi) {
			element.html('<i class="fa fa-spinner fa-spin fa-2x fa-fw margin-bottom"></i>');
			$.ajax({
				url: 'https://doi.org/' + doi,
				headers: {'Accept': 'text/x-bibliography;style=apa'},
				type: 'GET',
				success: function(result) {
					result = result.replace(/doi:(.*)/,'<a href="https://doi.org/$1">doi:$1</a>');
					element.html(result);
				},
				error: function(error) {
					element.html(`<a href="https://doi.org/${doi}">${doi}</a>`);
				}
			})
}

function hide_parameters_publication(val) {
    $('#parameters_paper').prop('hidden', val);
    $('#parameters_paper_label').prop('hidden', val);
}

$(function() {
	var $m_select = $('#method_selection');
	var $p_select = $('#parameters_selection');

    /* Set available methods */
	var m_options = '';
	$.each(method_data, function(key, method) {
		m_options += `<option value="${method.name}">${method.name}</option>\n`;
	})
	$m_select.append(m_options);

	/* Update parameter publication on change */
	$p_select.on('change', function() {
		var m_name = $('#method_selection option:selected').val();
		var p_name = $('#parameters_selection option:selected').text();

		var e = parameter_data[m_name].find(function (element) {
			return element.name === p_name;
		})

        /* Default parameters (not found in parameter_data) have no publication assigned */
        if (e === undefined) {
            hide_parameters_publication(true);
        }
		else{
            hide_parameters_publication(false);
            /* Some parameters have no publication */
            if (e.publication == null) {
                $('#parameters_paper').text('None');
            } else {
                fill_paper($('#parameters_paper'), e.publication);
            }
        }
	})

	/* Update method data on method select change */
	$m_select.on('change', function() {
		var m_name = $('#method_selection option:selected').val();
		var e = method_data.find(function (element) {
			return element.name === m_name;
		})

		$p_select.empty();
		if(e.has_parameters) {
			var p_options = '';
			$p_select.prop('disabled', false);
			$p_select.append('<option value="default">Select best (default)</option>');
			$.each(parameter_data[m_name], function(key, parameter_set) {
				p_options += `<option value="${parameter_set.filename}">${parameter_set.name}</option>\n`;
			})
			$p_select.append(p_options);
            $p_select.trigger('change');
		} else {
			$p_select.prop('disabled', true);
			$p_select.append('<option value="NA">No parameters<option>');
            hide_parameters_publication(true);
		}

		$('#method_name').text(e.full_name);

		if(e.publication == null) {
			$('#method_paper').text('None');
		} else {
			fill_paper($('#method_paper'), e.publication);
		}
	})

	$m_select.trigger('change');

	/* Allow submit only if file is selected */
	var $input = $('#file_input');
	var $submit = $('#calculate');

	$submit.prop('disabled', true);

	$input.on('change', function() {
		if($input.val()) {
			$submit.prop('disabled', false);
		} else {
			$submit.prop('disabled', true);
		}
	})
});