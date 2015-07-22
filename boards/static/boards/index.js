// var Asana = require('asana');
// var util = require('util');

var dragSourceColumn;
var currentWorkspace;
var currentUser;
var currentProject;
var allTasks = {};
var eventsInitialized = false;
var CLIENT_ID = localStorage.asanaClientId || 35463866756659;
var REDIRECT_URI = localStorage.asanaRedirectUri || 'https://hacks.chartbeat.com/asana/login.html';
var PHOTO_SIZE = 'image_36x36';

var TODO_COLUMN = {name: 'To Do:', id: -1,'status':'new'};
var DEFAULT_COLUMNS = [TODO_COLUMN,{name: 'In Progress:', id: -2,'status':'new'},{name: 'Done:', id: -3,'status':'new'}];

// Create a client.
var client = new Asana.Client(
  new Asana.Dispatcher({handleUnauthorized : function() {return false;}}),
  {
    clientId: CLIENT_ID,
    // By default, the redirect URI is the current URL, so for this example
    // we don't actually have to pass it. We do anyway to show that you can.
    redirectUri: REDIRECT_URI
  }
);
// Configure the way we want to use Oauth. Popup flow is not a default
// so we must indicate specifically we want that type of flow.
client.useOauth({
  flowType: Asana.auth.PopupFlow,
  credentials: localStorage.asanaToken
});
// When `authorize` is called it will pop up a window and navigate to
// the Asana authorization prompt. Most browsers block popups that do not
// open in direct response to a user action, so we trigger this function
// upon clicking a link rather than automatically.


window.onload = function() {
  client.users.me().then(
    function(user) {
      currentUser = user;
      currentWorkspace = user.workspaces[0];
      initbindEvents();
      selectProject();
    }, function (err) {
      console.log('Authorization needed.');
      $('#authorize').removeClass('hidden');
    }
  );
}

function initbindEvents(){
    //Reverse order checkbox
    $('#reverse_order').change(function() {
        board = $('#board');
        newBoard = board.clone();
        newBoard.children().remove();
        columnList = $('.column');
        for (i=columnList.length-1;i>=0;i--){
          currentColumn = columnList[i];
          newBoard.append(currentColumn);
        }
        board.replaceWith(newBoard);
    });
}

function authorize() {
  $('#authorize').html('Authorizing...');
  client.authorize().then(function(me) {

    console.log('Recieved authentication token.');
    localStorage.asanaToken = me.dispatcher.authenticator.credentials.access_token;

    $('#authorize').html('Fetching profile...');
    client.users.me().then(function(user) {
      $('#authorize').html('(' + user.name + ')');
      currentUser = user;
      // The user's "default" workspace is the first one in the list, though
      // any user can have multiple workspaces so you can't always assume this
      // is the one you want to work with.
      // TODO: default to the 0 one but allow people to switch to another
      currentWorkspace = user.workspaces[0];
    });
  }).catch(function(err) {
    $('#authorize').html('Error: ' + err.code + ': ' + err.description);
  }).finally(function(){
    selectProject();
  });
}

function initBoard(project) {
  $('#board').html('Fetching tasks...');
  var currentSection;
  var currentTasks = [];
  var sections = [];
  var numSections = 0;
  allTasks = {};
  preBoardSetup();

  var userId = currentUser.id;
  var workspaceId = currentUser.workspaces[0].id;
  client.tasks.findByProject(
      project.id,
      {
        opt_fields: 'id,name,notes,this.assignee.name,this.assignee.photo.' + PHOTO_SIZE + ',created_at,completed_at,completed,due_on,parent,this.tags.name,this.tags.color'
      })
  .then(function(collection) {
    $('#board').html('');
    $('#board').prepend( '<td id="add_column_cell" class="column">'
    + '<div class="columnTitle">'
    + '<input id="add_column" type="text" placeholder="Add a column"/>'
    + '</div></td>');
    $('#add_column').bind('keyup', function(event) {
        if(event.keyCode==13){
            //Enter key up
            newColumnName = $('#add_column').val();
            addNewColumnAndSection(newColumnName,project.id);
        }
        event.preventDefault();
    });
    collection.stream().on('data', function(task) {
      newSection = addTask(task, currentSection, project.id);
      if (newSection !== currentSection) {
        numSections++;
        sections.push(newSection);
        currentSection = newSection;
        console.log('current section: ', currentSection);
      }
      currentTasks.push(task);
      allTasks[task.id] = task;
    });
    //If any default columns were added, add them to Asana and update the cards
    addDefaultSectionsToAsana(sections,project.id);
	//doThis();
  })
  .finally(function(){
    postBoardSetup();

    if (project.metaData &&
        project.metaData.startDate &&
        project.metaData.endDate) {
      renderCumulativeFlow(project);
    }
  });
}

function addDefaultSectionsToAsana(sections,projectId){
    //If the current board only had one section, add default sections
    if(sections.length == 1){
      //Loop through our default sections, check if column was already added
      addOrderedSectionsInAsana(0,DEFAULT_COLUMNS,projectId);
    }
}

function updateCardSectionIds(sectionTemplate,projectId){
    //Set dom with new section id
    $('#'+sectionTemplate.id).attr('id',sectionTemplate.new_id);
    bindDragoverToColumn(sectionTemplate);
    bindDropEventToColumn(projectId,sectionTemplate.id);
}

function addNewColumnAndSection(newColumnName,projectId){
    if(newColumnName.length > 0){
        if (':' != newColumnName.charAt(newColumnName.length-1)) {
            newColumnName = newColumnName + ':';
        }
        newSection = {'name': newColumnName, id: -1,'status':'new'};
        addSectionInAsana(newSection,projectId,
          function(section){
             newSection.id = newSection.new_id;
             if($('#reverse_order').is(":checked")){
               reverseOrderAppendColumn(projectId,newSection);
             }else{
               appendColumn(projectId,newSection);
             }
             $('#add_column').val('');
          });
    }
}
var closeOnOutsideClick = function (e, dialog, dialogContainer) {
  // when anywhere in the doc is clicked
  var clickedOutside = true; // start searching assuming we clicked outside
  $(e.target).parents().andSelf().each(function () { // search parents and self
      // if the original dialog selector is the click's target or a parent of the target
      // we have not clicked outside the box
      if (this == dialogContainer) {
          clickedOutside = false; // found
          return false; // stop searching
      }
  });
  if (clickedOutside) {
    dialog.dialog("close");
    // unbind this listener, we're done with it
    $(document).off('click');
  }
}

function preBoardSetup() {
  var firstOpening;
  var assigneeDialog = $( '#assigneeDialog' ).dialog({
    dialogClass: 'no-title',
    autoOpen: false,
    title: 'Assign Task',
    width: '325px',
    open: function(e) {
      var dialogContainer = $(this).parents('.ui-dialog')[0];
      $(document).off('click').click(function(e){closeOnOutsideClick(e, assigneeDialog, dialogContainer)});
    },
  });
  var cardDialog = $( '.cardEditDialog' ).dialog({
    dialogClass: 'no-title',
    autoOpen: false,
    title: 'Edit Card',
    width: '325px',
    open: function(e) {
      var dialogContainer = $(this).parents('.ui-dialog')[0];
      $(document).off('click').click(function(e){closeOnOutsideClick(e, cardDialog, dialogContainer)});
    },
    /*close: function(event){
		alert($(this).parents('.card').attr('id'));
        updateSectionPoints($(this).parents('.card'));
    }*/
  });
}


// returns the task associated with a child element of a card
function getTaskFromElement(child) {
  return allTasks[$( child ).closest('.card').prop('id')];
}

function postBoardSetup() {
  // renderChart(project, currentTasks);
  $(document).tooltip({position: { my: "left top+5", at: "center-40 bottom", collision: "flipfit" }});

  if (!eventsInitialized) {
    /************************
     * Card update handlers *
     ************************/
    $(document.body).on('click', '.tagRemove', function(event) {
      event.stopPropagation();
      task = getTaskFromElement(this);
      tagElement = $( this ).closest('.tag');
      removeTag(task, tagElement.prop('id'));
      tagElement.remove();
    })
    .on('click', '.tagAdd', function(event) {
      event.stopPropagation();
      task = getTaskFromElement(this);
      addTag(task, this);
    })
    .on('change', '.cardComplete', function() {
      getTaskFromElement(this).completed = $( this ).prop('checked');
    })
    .on('change', '.cardTitle', function() {
      getTaskFromElement(this).pretty_name = $( this ).val();
    })
    .on('change', '.cardNotes', function() {
      getTaskFromElement(this).notes = $( this ).val();
    })
    .on('change', '.cardValue', function() {
      getTaskFromElement(this).point_value = $( this ).val();
    })
    .on('change', '.cardComment', function() {
      event.stopPropagation();
      addComment(getTaskFromElement(this), $( this ).val());
    })
    .on('change', '.card', function(event) {
      updateTask(getTaskFromElement(this));
    })
    .on('click', '.cardContainer', function(event) {
      // Prevent click from causing new card to be created
      event.stopPropagation();
    })
    .on('click', '.cardAssignee', function(event) {
      event.stopPropagation();
      $( '#assigneeDialog' ).dialog({
        position: {
          my: "top+5",
          at: "center",
          of: $( this ).closest('.card'),
          collision: "flipfit"
        },
      });
      selectUser(getTaskFromElement(this));
    })
    .on('card:refresh', function(event, task) {
      var card = $('#' + task.id);
      card.find('.cardTitle').val(task.pretty_name);
      card.find('.cardValue').val(task.point_value);
      card.find('.cardComplete').prop('checked', task.completed);
      var userImage = getUserImage(task.assignee);
      // Update the image on the card
      $('#assignee_img_' + task.id)
        .attr("src", userImage)
        .attr("alt", task.assignee ? task.assignee.name : 'Unassigned');
    })
    .on('click', '.zoomin', function(event) {
      event.stopPropagation();
      $( '.cardEditDialog' ).dialog({
        position: {
          my: "top+5",
          at: "center",
          of: $( this ).closest('.card'),
          collision: "flipfit"
        }
      });
      cardEdit(getTaskFromElement(this));
    })
    .on('mouseenter', '.card', function(event) {
      if ($(this).children('.zoomin').hasClass('hidden')) {
        $(this).children('.zoomin').removeClass('hidden');
      }
    })
    .on('mouseleave', '.card', function(event) {
      $(this).children('.zoomin').addClass('hidden');
    })
    /************************
     * Create task handlers *
     ************************/
    // On enter, show the plus icon unless already clicked
    .on('mouseenter', '.cardPadding, .column', function(event) {
      if ($(this).children('.zoomin').hasClass('hidden')) {
        $(this).children('.zoomin').removeClass('hidden');
      }
      if ($(this).children('.load').hasClass('hidden')) {
        $(this).children('.plus').removeClass('hidden');
      }
    })
    // On exit, hide the plus icon
    .on('mouseleave', '.cardPadding, .column', function(event) {
      $(this).children('.plus').addClass('hidden');
      $(this).children('.plus').addClass('hidden');
    })
    // Add/remove plus icon from the resident column so it does not appear
    // when mouse is over a card
    .on('mouseenter', '.cardContainer', function(event) {
      event.stopPropagation();
      $(this).parent().children('.plus').addClass('hidden');
    })
    .on('mouseleave', '.cardContainer', function(event) {
      event.stopPropagation();
      $(this).parent().children('.plus').removeClass('hidden');
    })
    // If the plus icon is showing, create new task on click
    .on('click', '.cardPadding, .column', function(event) {
      var plus = $(this).children('.plus');
      var load = $(this).children('.load');
      var opts = {
        'project': currentProject.id
      }

      var place;
      if ($(this).hasClass('cardPadding')) {
        id = $(this).parent().children('.card').prop('id');
        opts['insert_before'] = id;
        place = $('#' + id).parent();
      } else {
        id = $(this).prop('id');
        opts['section'] = id;
        place = '#' + id + ' > .addCard';
      }

      event.stopPropagation();
      if (!plus.hasClass('hidden') && load.hasClass('hidden')) {
        // Show the hidden icon, hide the plus icon
        load.removeClass('hidden');
        plus.addClass('hidden');
        // Animate the load icon
        var lower = function() { load.animate({'opacity':0}, 1000, higher); };
        var higher = function() { load.animate({'opacity':1}, 500, lower); };
        lower();

        // Create the task and add it to correct project
        client.tasks.createInWorkspace(currentWorkspace.id).then(function(new_task) {
          client.tasks.addProject(
            new_task.id,
            opts
          ).then(function(object) {
            // Create the card
            sectionCard = $(this).parent();
            createCard(new_task, place);
            allTasks[new_task.id] = new_task;
          }).finally(function(){
            // Hide the load icon
            load.addClass('hidden');
          });
        });
      }
    })
    .on('click', '.column', function(event) {
      event.stopPropagation();

      var load = $(this).children('.load');
      var id = $(this).prop('id');
      var opts = {
        'project': currentProject.id,
        'section': id
      }

      if (load.hasClass('hidden')) {
        load.removeClass('hidden');
        // Animate the load icon
        var lower = function() { load.animate({'opacity':0}, 1000, higher); };
        var higher = function() { load.animate({'opacity':1}, 500, lower); };
        lower();

        // Create the task and add it to correct project
        client.tasks.createInWorkspace(currentWorkspace.id).then(function(new_task) {
          client.tasks.addProject(
            new_task.id,
            opts
          ).then(function(object) {
            // Create the card
            createCard(new_task, '#' + id + ' > .addCard');
            allTasks[new_task.id] = new_task;
          }).finally(function(){
            // Hide the load icon
            load.addClass('hidden');
          });
        });
      }
    })
    /**************************
     * Drag and drop handlers *
     **************************/
    .on('dragstart', '.cardContainer', function(event) {
      event.originalEvent.dataTransfer.setData(
        "text/plain", $(event.target).children('.card').prop('id'));
      this.style.opacity = '0.4';
      dragSourceColumn = this.parentElement;
    })
    .on('dragend', '.cardContainer', function(event) {
      this.style.opacity = '1.0';

      // Remove any existent drop shadow when done dragging
      if (taskDropTarget) {
        removeDropShadow();
      }
    })
    .on('dragenter', '.card', function(event) {
      // Determine the card being dragged over
      var target;
      if ($(event.target).hasClass('shadow')) {
        return;
      }
      if ($(event.target).hasClass('cardContainer')) {
        target = event.target;
      } else if ($(event.target).parents('.cardContainer')) {
        target = $(event.target).parents('.cardContainer').get(0);
      }

      // Remove the drop shadow if dragging over a different card
      if (taskDropTarget && target !== taskDropTarget) {
        removeDropShadow();
      }

      // Add drop shadow if none exists
      if (!taskDropTarget) {
        addDropShadow(target, 'before');
      }
    })
    .on('dragover', '.column', function(event) {
      event.preventDefault();
      if (taskDropTarget && taskDropTarget != this) {
        removeDropShadow();
      }
      if (!taskDropTarget) {
        addDropShadow($(this).children('.addCard'), 'before');
      }
    })
    .on('dragover', '#dropShadow', function(event) {
      // Allow cards to be dropped onto the shadow
      event.stopPropagation();
      event.preventDefault();
  }).on('drop', '.column', function(event){
	  doDropCardEvent(event,this,currentProject.id);
  });
    eventsInitialized = true;
  }
}

function doDropCardEvent(event,targetColumn,projectId) {
      var notecard = event.originalEvent.dataTransfer.getData("text/plain");
      // Object specifying where in the project this task should be placed
      var targetProject = {
         'project': projectId
      };
      // Add card to new column, before the task dragged over if applicable
      if (taskDropTarget && taskDropTarget != targetColumn) {
        targetProject['insert_before'] = $(taskDropTarget).children('.card').prop('id');
        $(taskDropTarget).before($('#' + notecard).parent());
      } else {
        targetProject['section'] = targetColumn.id;
		//alert(targetColumn.id);
        $(targetColumn).children('.addCard').before($('#' + notecard).parent());
      }
	  //Asana api calls
      event.preventDefault();
          // add to new project/section
          // If dragging to the bottom of the same section, first fremove the section
          if (targetColumn === dragSourceColumn && targetProject['section']) {
            client.tasks.addProject(
              notecard,
              {
                'project': currentProject.id,
                'section' :null
              }
            ).then(function() {
              moveTaskInAsana(notecard, targetProject);
            });
          } else {
            moveTaskInAsana(notecard, targetProject);
          }
    }

function isSectionTask(task) {
  return ':' == task.name.charAt(task.name.length-1);
}

function addTask(task, currentSection, projectId) {
  if (isSectionTask(task)) {
    // we're a section
    currentSection = task;
    prependColumn(projectId, currentSection);
  } else {
    // we're a task
	if (currentSection === undefined){
		//There is no current section
		currentSection = TODO_COLUMN;
		prependColumn(projectId, currentSection);
	}
    createCard(task, '#' + currentSection.id + ' > .addCard');
  }
  return currentSection;
}

// Defines the current card being dragged over
var taskDropTarget;

function removeDropShadow() {
  if (taskDropTarget) {
    taskDropTarget = null;
    $('#dropShadow').remove();
  }
}

function addDropShadow(node, method) {
  var dropShadow =
    '<div id="dropShadow" class="cardContainer card shadow"></div>';

  if (method === 'append') {
    $(node).append(dropShadow);
  } else if (method === 'before') {
    $(node).before(dropShadow);
  } else {
    return;
  }

  taskDropTarget = node;

}

function newTagElement(tag) {
  var colorClass = ''
  if (tag.color) {
    colorClass = tag.color;
  } else {
    colorClass = 'no-color';
  }
  return '<span class="'
    + colorClass
    + ' tag" id="'
    + tag.id
    + '">'
    + tag.name
    + '<a href="#" class="tagRemove">x</a>'
    + '</span> '
}

function createCard(task, beforeCard) {
  // strip out the bracketed number and show that separately
  var taskAry = /(.*)\[([^\]]*)\]\s*(.*)/.exec(task.name);
  var taskName = '';
  var taskValue = '';
  if (taskAry && isFinite(taskAry[2])) {
    taskName = taskAry[1] + taskAry[3];
    taskValue = taskAry[2];
    task.point_value = parseInt(taskValue);
    task.pretty_name = taskName;
  } else {
    taskName = task.name;
    task.point_value = 0;
    task.pretty_name = task.name;
  }

  var assigneeId = task.id + '_assignee';

  var card = $(
      '<div class="cardContainer" draggable="true">'
      + '<div class="cardPadding">'
      + '<div class="plus hidden">'
      + '<svg class="icon" viewBox="0 0 5 5" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M2 1 h1 v1 h1 v1 h-1 v1 h-1 v-1 h-1 v-1 h1 z" /></svg></div>'
      + '<div class="load hidden">'
      + '<svg class="icon" viewBox="0 0 2 2" xlmns="http://www.w3.org/2000/svg">'
      + '<circle cx="1" cy="1" r="1" /></svg></div>'
      + '</div>'
      + '<div class="card" id="'
      + task.id + '">'
      + '<span class="ui-icon ui-icon-extlink zoomin hidden"></span>'
      + '<div class="personDone">'
      + '<div class="cardAssignee" >'
      + '<img id="assignee_img_' + task.id + '" src="'
      + getUserImage(task.assignee)
      + '" title="Click to assign"/>'
      + '</div>'
      + '<input class="cardComplete" id="'
      + task.id + '-checkbox'
      + '" type="checkbox" /><label class="cardComplete" for="'
      + task.id + '-checkbox'
      + '"></label>'
      + '</div>'
      + '<div class="titlevalue">'
      + '<div class="titleContainer"><textarea class="cardTitle">'
      + taskName
      + '</textarea></div>'
      + '<div class="valueContainer"><textarea class="cardValue" >'
      + taskValue
      + '</textarea></div>'
      + '</div>'
      + '</div>'
      + '</div>'
      );
  card.find('.cardComplete').prop('checked', task.completed);

  $(beforeCard).before(card);

  updateSectionPoints(card);
  // $('#' + task.id + '_close').prop('checked', task.completed);


  /* This isn't really working as expected.
   * The hiding works the first time you pass over it but
   * it doesn't turn visible thereafter.  I think it's
   * because the image element is no longer visible/hoverable
  $('#' + assigneeId ).hover(function(event) {
    if (!task.assignee) {
      $('#' + assigneeId).css('visibility', 'visible')
    }
  },
  function(event) {
    if (!task.assignee) {
      $('#' + assigneeId).css('visibility', 'hidden')
    }
  });
  */
}

function updateSectionPoints(card){
    pointValueContainer = card.parent().find('.sectionValue');
	//alert("point value = " + pointValueContainer.text());
	currentPoints = parseFloat(pointValueContainer.text());
    console.log(pointValueContainer);
	var totalPoints = 0;
	//Loop through all children
	card.parent().children('.cardContainer').each(function () {
	//	alert($(this).find('.cardValue').text());
		currentPoints = parseFloat($(this).find('.cardValue').val());
		if(isNaN(currentPoints)){
			currentPoints = 0;
		}
		totalPoints = totalPoints + currentPoints;
	});

    pointValueContainer.text(totalPoints);
}


function addComment(task, comment) {
  return client.tasks.addComment(
    task.id,
    {
      'text': comment,
    });
}

function updateTask(task) {
  task.name = task.pretty_name;
  if (task.point_value) {
    task.name = '[' + task.point_value + '] ' + task.pretty_name;
  }
  updateSectionPoints($('#'+task.id).parent());
  console.log('Updating task: ', task);
  return client.tasks.update(
    task.id,
    {
      'name': task.name,
      'completed': task.completed,
      'notes': task.notes,
    });
}

function updateAssignee(task) {
  console.log('Updating task assignee: ', task);
  $( '#' + task.id ).trigger('card:refresh', task);
  var userImage = getUserImage(task.assignee);
  // Update the image on the cardEditDialog
  $('#cardAssigneeImage')
    .attr("src", userImage)
    .attr("alt", task.assignee ? task.assignee.name : 'Unassigned');
  return client.tasks.update(
    task.id,
    {
      'assignee': task.assignee ? task.assignee.id : null,
    });
}

function removeTag(task, tagId) {
  console.log('Removing tag from task: ', tagId, task);
  return client.tasks.removeTag(
    task.id,
    {
      'tag': tagId,
    });
}

function addTag(task, addIconElement) {
  // allows the user to select a tag, adds it to the task and
  // updates the card by inserting the tag prior to addIconElement

  $( addIconElement ).before('<input autocomplete="off" id="tag_typeahead_input" placeholder="tag">');
  var tagInput = $( '#tag_typeahead_input' ).autocomplete({
    source: tagMatcher(),
  })
  .val('')
  .focus()
  .off('autocompleteselect')
  .on('autocompleteselect', function(ev, ui) {
    console.log('Selection: ', ui.item);
    client.tags.findById(
      ui.item.value,
      {
        opt_fields: 'id,name,color',
      }
      ).then(function(tag) {
        console.log('Adding tag to task: ', task, tag);
        client.tasks.addTag(
            task.id,
            {
              'tag': tag.id,
            });
        $('.cardTags').append(newTagElement(tag));
        tagInput.remove();
      }, function(reason) {
        console.log('Exception: ' + reason);
      }).finally(function(){
        $('#tag_typeahead_input').autocomplete('destroy');
      });
  });
}

function appendColumn(projectId,section){
	console.log('Appending Column');
    columnName = section.name.replace(':', '');
	$('#add_column_cell').before(createNewColumnCode(projectId,section));
    bindDragoverToColumn(section);
    bindDropEventToColumn(projectId,section.id);
    // setup the columns to allow cards to be dropped in them.
    // reassign the card's task to a new section when dropped.
}

function reverseOrderAppendColumn(projectId,section){
console.log('Appending Column');
    columnName = section.name.replace(':', '');
    $('#add_column_cell').after(createNewColumnCode(projectId,section));
    bindDragoverToColumn(section);
    bindDropEventToColumn(projectId,section.id);
    // setup the columns to allow cards to be dropped in them.
    // reassign the card's task to a new section when dropped.
}

function prependColumn(projectId, section) {
  console.log('Prepending Column');
  $('#board').prepend(createNewColumnCode(projectId,section));
  bindDragoverToColumn(section);
  bindDropEventToColumn(projectId,section.id);
  // setup the columns to allow cards to be dropped in them.
  // reassign the card's task to a new section when dropped.

}
function createNewColumnCode(projectId,section){
 var columnName = section.name.replace(':', '');
 var newColumnCode = '<td class="column" id="' + section.id + '">'
     + '<div class="columnTitle"><span class="sectionTitle">'
     + columnName + '</span>'
     + '<span class="sectionValue">'
     + 0
     + '</span></div>'
     + '<div class="addCard">'
     + 'Add a card'
     + '</div>'
     + '<div class="load hidden">'
     + '<svg class="icon" viewBox="0 0 2 2" xlmns="http://www.w3.org/2000/svg">'
     + '<circle cx="1" cy="1" r="1" /></svg></div>'
     + '</td>'
	 return newColumnCode;
}
function bindDragoverToColumn(section){
    $('#' + section.id).bind('dragover', function(event) {
      event.preventDefault();
      if ($(event.target).hasClass('shadow')) {
        return;
      } else if (taskDropTarget && taskDropTarget != this) {
        removeDropShadow();
      }
      if (!taskDropTarget) {
        addDropShadow($(this).children('.addCard'), 'before');
      }
      // event.originalEvent.dataTransfer.dropEffect = 'move';
    });
}

function bindDropEventToColumn(projectId,sectionId){
    $('#' + sectionId).bind('drop', function(event) {
		doDropCardEvent(event,this,projectId);
    });
}

function addOrderedSectionsInAsana(startIndex,sectionList,projectId){
    if(startIndex < sectionList.length){
        console.log('Adding section status:' + sectionList[startIndex].status);
    }
    if(startIndex < sectionList.length && sectionList[startIndex].status == 'new'){
        addSectionInAsana(sectionList[startIndex],projectId,
             function(section){
               if($('#'+sectionList[startIndex].id).length != 0){
                 console.log('updating column in view for id = ' + sectionList[startIndex].id);
                 updateCardSectionIds(sectionList[startIndex],projectId);
               }else{
                 sectionList[startIndex].id = sectionList[startIndex].new_id
                 appendColumn(projectId, sectionList[startIndex]);
               }
               addOrderedSectionsInAsana(++startIndex,sectionList,projectId)
             });
    }

}

function addSectionInAsana(sectionTemplate,projectId,finallyFunction){
    console.log('Adding section name:' + sectionTemplate.name);
    sectionTemplate.status='creating';
    client.tasks.create(
        {
            'name':sectionTemplate.name,
            'projects':[projectId],
            'workspace':currentWorkspace.id
        }
    ).then(function(section) {
        console.log('New section id: ', section);
        //update sectionTemplate with new id
        sectionTemplate.new_id = section.id;
        return section;
    }, function(reason) {
         console.log('Exception: ' + reason);
    }).finally(finallyFunction);

}

function moveTaskInAsana(notecard,targetProject){
    // add to new project/section
    client.tasks.addProject(
      notecard,
      targetProject);
}

function getUserImage(user) {
  if (user) {
    if (user.photo) {
      return user.photo[PHOTO_SIZE];
    }
  }
  return 'head2.png';
}

function selectUser(task){
  console.log('Opening assign task dialog for: ', task);
  $('#assignee_popup_assign_to_me_button').button()
    .off('click')
    .click(function(event){
      task.assignee = currentUser;
      updateAssignee(task);
      $( '#assigneeDialog' ).dialog("close");
    });
  var dialogInput = $('#assignee_popup_typeahead_input');
  var assigneeDialog = $('#assigneeDialog').dialog('open')
    .off('dialogbeforeclose')
    .on('dialogbeforeclose', function(event, ui) {
      if (dialogInput.val() === '') {
        task.assignee = null;
        updateAssignee(task);
      }
    });
  dialogInput.autocomplete({
    source: userMatcher(),
  })
  .val(task.assignee ? task.assignee.name : '')
  .select()
  .off('autocompleteselect')
  .on('autocompleteselect', function(ev, ui) {
    console.log('Selection: ', ui.item);
    assigneeDialog.dialog('close');
    dialogInput.autocomplete('destroy');
    // TODO change the assignee to an 'updating' icon
    client.users.findById(
      ui.item.value,
      {
        opt_fields: 'id,name,this.photo.' + PHOTO_SIZE,
      }
      ).then(function(user) {
        console.log('Full user: ', user);
        task.assignee = user;
        return user;
      }, function(reason) {
        console.log('Exception: ' + reason);
      }).finally(function(user){
        updateAssignee(task);
      });
  });
}

function cardEdit(task){
  console.log('Opening task edit dialog for: ', task);
  var dlog = $('.cardEditDialog');
  dlog.find('.card').attr('id', task.id);
  $('.closeCard').button()
    .click(function(event){
      dlog.dialog("close");
    });
  dlog.find('.cardTitle').val(task.pretty_name);
  dlog.find('.cardNotes').val(task.notes);
  dlog.find('.cardValue').val(task.point_value);
  dlog.find('.cardComment').val('');
  dlog.find('.cardComplete').prop('checked', task.completed);
  comments = dlog.find('.cardComments');
  comments.html('Loading comments...');
  var tags = dlog.find('.cardTags').html('');
  if (task.tags) {
    task.tags.forEach(function(tag){
      tags.prepend(newTagElement(tag));
    });
  }
  var userImage = getUserImage(task.assignee);
  $('#cardAssigneeImage')
    .attr("src", userImage)
    .attr("alt", task.assignee ? task.assignee.name : 'Unassigned');
  dlog.dialog('open')
    .off('dialogbeforeclose')
    .on('dialogbeforeclose', function(event, ui) {
      $( '#' + task.id ).trigger('card:refresh', task);
    });
  client.stories.findByTask(
      task.id,
      {
        opt_fields: 'id,type,html_text,this.created_by.name'
      })
  .then(function(collection) {
    comments.html('');
    collection.stream().on('data', function(story) {
      if (story.type === 'comment') {
        console.log(story);
        comments.append('<div class="cardCommentInfo">'
          + '<b>' + story.created_by.name + ': ' + '</b>'
          + story.html_text + '</div>');
      }
    });
  });
}

function selectProject(){
  var projectInput = $('#projectSelector .typeahead');
  projectInput.autocomplete({
    source: projectMatcher(),
  })
  .val('')
  .focus()
  .select()
  .on('autocompleteselect', function(ev, ui) {
    console.log('Selection: ', ui.item)
    client.projects.findById(
      ui.item.value,
      {
        opt_fields: 'id,name,archived,created_at,modified_at,color,notes,workspace,team',
      }
      ).then(function(project) {
        project.metaData = parseProjectMetaData(project.notes);
        console.log('Project: ', project);
        currentProject = project;
        initBoard(project);
        projectInput.val(project.name);
      });
    projectInput.blur();
  });
  $('#projectSelector').css("visibility", "visible");
}

/**
 * Takes a project's "notes" field and finds embedded metadata JSON. Embedded
 * metadata is a JSON string that is delimited from other plaintext notes by the
 * starting string "metadata =====" and then ending string "=====". As an
 * example, if a notes field (the project "description" in Asana's web GUI)
 * contains:
 *
 *     This is a project that exists just for example purposes. Blah blah blah.
 *
 *     metadata =====
 *     {
 *       "startDate": "2015-07-13",
 *       "endDate": "2015-07-20"
 *     }
 *     =====
 *
 * The JSON blob with the start and end dates will be parsed and an object with
 * "startDate" and "endDate" fields will be returned.
 */
var parseProjectMetaData = function(notes) {
  if (!notes) {
    return null;
  }

  // Regex to match the metadata blob. We're case-insensitive and forgiving on
  // "metadata" vs "meta-data". We also match "at least 3" equals signs in a row
  // to start and end the actual JSON blob. So pretty forgiving on specifics
  // overall.
  var metadataRegex = /meta(?: |-)?data\s*={3,}\s+([^]*?)\s+={3,}/i;
  var match = metadataRegex.exec(notes);

  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch(e) {
      console.error('Error parsing metadata JSON from project description/notes', e);
    }
  }

  return null;
};

var projectMatcher = function() {
  return objectMatcher('project');
}

var tagMatcher = function() {
  return objectMatcher('tag');
};

var userMatcher = function() {
  return objectMatcher('user');
};

var objectMatcher = function(objectType) {
  return function(request, responseCallback) {
    console.log("Searching for " + objectType + ": " + request.term);
    client.workspaces.typeahead(
        currentWorkspace.id,
        {
          type: objectType,
          query: request.term,
        })
    .then(function(response) {
      responseCallback(response.data.map(function(obj) {
        return {label: obj.name, value: obj.id};
      }));
    });
  }
};


function setupDemo() {
  preBoardSetup();
  var projectId = 1;
  var photo = {};
  photo[PHOTO_SIZE] = 'head.png';
  var user = { photo: photo, name: 'bob' };
  tasks = [
    {
      name: 'Blocked:',
      id: 101,
      assignee: user,
    },
    {
      name: 'Done:',
      id: 102,
      assignee: user,
    },
    {
      name: '[13] Bacon ipsum dolor amet quis picanha reprehenderit meatloaf lorem.',
      id: 2,
      assignee: user,
      completed: true,
      tags: [ { id: 10002, name: 'bug', color: 'light-yellow' } ]
    },
    {
      name: '[13] Learn Python',
      id: 22,
      assignee: user,
      completed: true,
      tags: [ { id: 10002, name: 'education', color: null } ]
    },
    {
      name: 'QA:',
      id: 103,
      assignee: user,
    },
    {
      name: 'Code Review:',
      id: 104,
      assignee: user,
    },
    {
      name: '[1] Lorum ipsum bacon dolar.',
      id: 200,
      assignee: user,
      tags: [ { id: 10001, name: 'orange', color: 'dark-orange' } ]
    },
    {
      name: '[1] Lorum ipsum bacon dolar.',
      id: 201,
      assignee: user,
      tags: [ { id: 10001, name: 'purple', color: 'dark-purple' } ]
    },
    {
      name: '[1] Lorum ipsum bacon dolar.',
      id: 202,
      assignee: user,
      tags: [ { id: 10001, name: 'gray', color: 'dark-warm-gray' } ]
    },
    {
      name: '[1] Lorum ipsum bacon dolar.',
      id: 203,
      assignee: user,
      tags: [ { id: 10001, name: 'lpink', color: 'light-pink' } ]
    },
    {
      name: '[1] Lorum ipsum bacon dolar.',
      id: 204,
      assignee: user,
      tags: [
        { id: 10001, name: 'lgreen', color: 'light-green' },
        { id: 10001, name: 'lyellow', color: 'light-yellow' },
        { id: 10001, name: 'lorange', color: 'light-orange' },
        { id: 10001, name: 'lpurple', color: 'light-purple' },
        { id: 10001, name: 'lwarm-gray', color: 'light-warm-gray' },
      ]
    },
    {
      name: '[1] Lorum ipsum bacon dolar.',
      id: 205,
      assignee: user,
      tags: [
        { id: 10001, name: 'lblue', color: 'light-blue' },
        { id: 10001, name: 'lred', color: 'light-red' },
        { id: 10001, name: 'lteal', color: 'light-teal' },
      ]
    },
    {
      name: 'In Progress:',
      id: 3,
      assignee: user,
    },
    {
      name: '[3] Learn Django',
      id: 4,
      assignee: user,
      tags: [ { id: 10001, name: 'brown', color: 'dark-brown' } ]
    },
    {
      name: 'To Do:',
      id: 5,
      assignee: user,
    },
    {
      name: '[Bug] It doesn\'t work!',
      id: 6,
      assignee: user,
      tags: [
        { id: 10001, name: 'blocker', color: 'dark-pink' },
        { id: 10002, name: 'bug', color: 'light-yellow' },
      ]
    },
    {
      name: '[.5] Lorum ipsum bacon dolar.',
      id: 7,
      assignee: user,
      tags: [ { id: 10001, name: 'blocker', color: 'dark-pink' } ]
    },
    {
      name: '[11] Learn HTML5',
      id: 9,
      assignee: user,
      tags: [ { id: 10001, name: 'green', color: 'dark-green' } ]
    },
    {
      name: '[8] Learn Angular',
      id: 11,
      assignee: user,
      tags: [ { id: 10001, name: 'blue', color: 'dark-blue' } ]
    },
    {
      name: '[8] Learn CSS',
      id: 12,
      assignee: user,
      tags: [ { id: 10001, name: 'red', color: 'dark-red' } ]
    },
    {
      name: '[3] Learn HTML5',
      id: 13,
      assignee: user,
      tags: [ { id: 10001, name: 'teal', color: 'dark-teal' } ]
    },
  ];
  var currentSection;
  var sections = [];
  tasks.forEach(function(task){
      newSection = addTask(task, currentSection, projectId);
      if (newSection !== currentSection) {
        sections.push(newSection);
        currentSection = newSection;
      }
      allTasks[task.id] = task;
  });
  postBoardSetup();
}

function renderChart(project, tasks) {
  // the asana project api does not yet have access to the due date
  // http://stackoverflow.com/questions/27801714/set-project-owner-and-project-due-date-using-api

  // prompt the user for the sprint start/end dates
  //
  var endDate = new Date();
  endDate.setDate(endDate.getDate() + 14);
  // create an array of dates containing one bucket for each day in the sprint
  //
  var lineDataActual = [];
  for (var d = new Date(); d.getTime() <= endDate.getTime(); d.setDate(d.getDate() + 1)) {
    var y_val = 0;
    tasks.forEach(function(task){
    // cycle through tasks and add task value to each bucket where the bucket date < task completion date
      if (!task.completed || task.completed_at.getTime() <= d.getTime()) {
        y_val += task.point_value;
      }
    });
    lineDataActual.push({'x': d.getTime(), y: y_val});
  }

  var testlineDataActual = [{
    'x': 0,
    'y': 200
  }, {
    'x': 10,
    'y': 50
  }, {
    'x': 20,
    'y': 180
  }, {
    'x': 30,
    'y': 60
  }, {
    'x': 40,
    'y': 120
  }, {
    'x': 50,
    'y': 30
  }];

  var svg = d3.select("#visualisation"),
      width = 1000,
      height = 500,
      margins = {
        top: 80,
        right: 50,
        bottom: 80,
        left: 80
      },
      xMin = d3.min(lineDataActual, function (d) {
        return d.x;
      }),
      xMax = d3.max(lineDataActual, function (d) {
        return d.x;
      }),
      yMin = d3.min(lineDataActual, function (d) {
        return d.y;
      }),
      yMax = d3.max(lineDataActual, function (d) {
        return d.y;
      }),

      xRange = d3.scale.linear().range([margins.left, width - margins.right]).domain([

          xMin,xMax
          ]),

      yRange = d3.scale.linear().range([height - margins.top, margins.bottom]).domain([

          yMin,yMax
          ]),

      xAxis = d3.svg.axis()
        .scale(xRange)
        .tickSubdivide(true),

      yAxis = d3.svg.axis()
        .scale(yRange)
        .orient("left")
        .tickSubdivide(true);

  function make_x_axis() {
    return d3.svg.axis()
      .scale(xRange)
      .orient("bottom")
      .tickSubdivide(true)
  }

  function make_y_axis() {
    return d3.svg.axis()
      .scale(yRange)
      .orient("left")
      .tickSubdivide(true)
  }


  svg.append("g")
    .attr("class", "grid")
    .attr("transform", "translate(0," + (height - margins.top) + ")")
    .call(make_x_axis()
        .tickSize((-height) + (margins.top + margins.bottom), 0, 0)
        .tickFormat("")
        )

    svg.append("g")
    .attr("class", "grid")
    .attr("transform", "translate(" + (margins.left) + ",0)")
    .call(make_y_axis()
        .tickSize((-width) + (margins.right + margins.left), 0, 0)
        .tickFormat("")
        )

    svg.append("svg:g")
    .attr("class", "x axis")
    .attr("transform", "translate(0," + (height - (margins.bottom)) + ")")
    .call(xAxis);

  svg.append("svg:g")
    .attr("class", "y axis")
    .attr("transform", "translate(" + (margins.left) + ",0)")
    .call(yAxis);



  var lineFunc = d3.svg.line()
    .x(function (d) {
      return xRange(d.x);
    })
  .y(function (d) {
    return yRange(d.y);
  })
  .interpolate('basis');


  var lineDataIdeal = [{
    'x': xMin,
      'y': yMax
  }, {
    'x': xMax,
      'y': yMin
  }];


  svg.append("svg:path")
    .attr("d", lineFunc(lineDataIdeal))
    .attr("class", "ideal");

  svg.append("svg:path")
    .attr("d", lineFunc(lineDataActual))
    .attr("class", "actual");

  svg.append("text")
    .attr("class", "x label")
    .attr("text-anchor", "end")
    .attr("x", width)
    .attr("y", height -6)
    .text("Days");

  svg.append("text")
    .attr("class", "y label")
    .attr("text-anchor", "end")
    .attr("y", 6)
    .attr("dy", ".75em")
    .attr("transform", "rotate(-90)")
    .text("Points remaining");
}



var postProcessTask = function(task) {
  var prettyName = task.name;
  var points = 0;

  var match = /^\s*\[([0-9.]+)\]\s*(.*)$/.exec(task.name);

  if (match) {
    points = parseInt(match[1], 10);
    prettyName = match[2];
  }

  task.points = points;
  task.prettyName = prettyName;
};


/**
 * Render a cumulative flow graph that shows time on the x axis, and task points
 * on the y axis, where points are grouped by section. This lets you see how the
 * task points move from section to section over the course of time (hopefully
 * points are moving towards the "Done" or "Completed" section!)
 *
 * This relies on some metadata being in the project's notes field (the
 * Description field in the interface). Specifically, it needs a startDate and
 * endDate to be defined in the metadata. For example, the following text in a
 * project description would set the start and end dates for the project:
 *
 *     metadata =====
 *     {
 *       "startDate": "2015-07-21",
 *       "endDate": "2015-08-03"
 *     }
 *     =====
 *
 * This is still super-hacky and needs to be broken up, cleaned up, etc.
 */
var renderCumulativeFlow = function(project) {
  var tasks = {};
  var storyPromises = [];
  var sections = [{
    'index': 0,
    'name': 'Uncategorized'
  }];

  function getSectionAsOfDate(task, isoDateString) {
    if (task['created_at'] > isoDateString) {
      return null;
    }

    var sectionName = task.section || 'Uncategorized';
    if (!task.stories || !task.stories.length) {
      return sectionName;
    }

    for (var i = task.stories.length - 1; i >= 0; i--) {
      if (task.stories[i]['created_at'] > isoDateString) {
        sectionName = task.stories[i].oldSection;
      } else {
        break;
      }
    }

    return sectionName;
  }

  client.tasks.findByProject(
      project.id,
      {
        opt_fields: 'id,name'
      })
  .then(function(taskCollection) {
    var currentSection = null;
    var tasks = [];
    var storyPromises = [];
    var sectionIndex = 1;

    var taskStream = taskCollection.stream();

    taskStream.on('data', function(task) {
      if (isSectionTask(task)) {
        currentSection = task.name.substring(0, task.name.length - 1);
        sections.push({
          'index': sectionIndex,
          'name': currentSection
        });
        sectionIndex++;
      } else {
        task.section = currentSection;
        postProcessTask(task);

        tasks.push(task);

        var storyPromise =
            client.stories.findByTask(task.id, {'limit': 100})
            .then(function(storyCollection) {
              task.stories = storyCollection.data
              .map(function(story) {
                if (story.type === 'system') {
                  var match = story.text.match(/moved from (.+) to (.+) \((.+)\)/);
                  if (match && match[3] === project.name) {
                    story.oldSection = match[1];
                    story.newSection = match[2];
                  }
                }
                return story;
              })
              .filter(function(story) {
                // Filter to only the section move stories.
                return !!story.oldSection;
              });
            });

        storyPromises.push(storyPromise);
      }
    });

    return new Promise(function(resolve, reject) {
      taskStream.on('end', function() {
        Promise.all(storyPromises)
        .then(function() {
          resolve(tasks);
        })
      });
    })
  })
  .then(function(tasks) {
    function parseNaiveDate(dateString) {
      var match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dateString);
      if (!match) {
        return null;
      }
      return new Date(parseInt(match[1], 10),
          parseInt(match[2], 10) - 1, // Months are zero-based
          parseInt(match[3], 10));
    }

    var startDate = parseNaiveDate(project.metaData.startDate);
    var endDate = parseNaiveDate(project.metaData.endDate);

    var chartModel = [];
    var currentDate = new Date(startDate.getTime());

    while(currentDate <= endDate) {
      var dayModel = {
        'date': new Date(currentDate.getTime()),
        'sections': [],
        'sectionsByName': {}
      };
      sections.forEach(function(section) {
        var sectionModel = {
          'name': section.name,
          'tasks': [],
          'points': 0
        };
        dayModel.sectionsByName[section.name] = sectionModel;
        dayModel.sections.push(sectionModel);
      });

      // Advance currentDate to the next day. This will be midnight in between
      // the day we're processing and the next day.
      currentDate.setDate(currentDate.getDate() + 1);

      var isoDateString = currentDate.toISOString();
      tasks.forEach(function(task) {
        var sectionName = getSectionAsOfDate(task, isoDateString);
        // null section at this point means the task didn't even exist as of
        // this date. Tasks that were not in any section as of this date are now
        // under "Uncategorized" section.
        if (sectionName) {
          var sectionModel = dayModel.sectionsByName[sectionName];
          sectionModel.tasks.push(task);
          sectionModel.points += task.points;
        }
      });

      chartModel.push(dayModel);
    }

    var width = 1000;
    var height = 600;
    var timeScale = d3.time.scale()
      .domain([startDate, endDate])
      .range([0, width]);
    var pointScale = d3.scale.linear()
      .domain([
        0,
        d3.max(chartModel, function(d) {
          return d3.sum(d.sections, function(d) {return d.points;});
        })
      ])
      .range([height, 0]);
    var colorScale = d3.scale.category10();

    var sectionLayerModel = sections.map(function(section) {
      var sectionName = section.name;
      var layer = {
        'index': section.index,
        'name': sectionName
      };

      layer.days = chartModel.map(function(day) {
        return {
          'date': day.date,
          'points': day.sectionsByName[sectionName].points,
          'tasks': day.sectionsByName[sectionName].tasks,
          'y0': 0
        };
      });

      return layer;
    });

    sectionLayerModel.reverse();

    var stack = d3.layout.stack()
      .values(function(layer) {
        return layer.days;
      })
      .x(function(d) {
        return d.date;
      })
      .y(function(d) {
        return d.points;
      })
      .out(function(d, y0) {
        d.y0 = y0;
      });

    stack(sectionLayerModel);

    var streamContainer = d3.select('.cumulative-flow-viz .cumulative-flow-streams');
    streamContainer.selectAll('*').remove();

    // Set up d3's area function to draw each stream
    var calcStreamArea = d3.svg.area()
        .x(function(d) {
          return timeScale(d.date);
        })
        .y0(function(d) {
          return pointScale(d.y0);
        })
        .y1(function(d) {
          return pointScale(d.y0 + d.points);
        });

    // g for each layer dataset.
    var streamGroups = streamContainer
        .selectAll('g')
        .data(sectionLayerModel, function(d) {return d.name;});

    // Add any entering layer as an svg:g with a svg:path element inside.
    var enter = streamGroups
        .enter()
        .append('g')
        .attr('class', function(d) {
          return 'section-stream-' + d.name.trim().replace(/\s+/g, '-').toLowerCase();
        })
        .append('path')
        .attr('class', 'stream');

    // Set the stream path for each series
    streamGroups
        .selectAll('.stream')
        .attr('d', function(d) {return calcStreamArea(d.days);})
        .attr('fill', function(d) {return colorScale(d.index);});

    var axesContainer = d3.select('.cumulative-flow-viz .cumulative-flow-axes');
    axesContainer.selectAll('*').remove();

    var xAxis = d3.svg.axis()
        .scale(timeScale)
        .orient('bottom');

    var yAxis = d3.svg.axis()
        .scale(pointScale)
        .orient('left');

    axesContainer.append('g')
        .attr('class', 'graph-axis cumulative-flow-x-axis')
        .attr('transform', 'translate(0,' + height + ')')
        .call(xAxis);
    axesContainer.append('g')
        .attr('class', 'graph-axis cumulative-flow-y-axis')
        .call(yAxis);
  });
};

