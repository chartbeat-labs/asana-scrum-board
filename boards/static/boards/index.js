// var Asana = require('asana');
// var util = require('util');

var dragSourceColumn;
var currentWorkspace;
var currentUser;
var currentProject;
var allTasks = {};
var CLIENT_ID = 35463866756659;
var REDIRECT_URI = 'http://127.0.0.1:8000/static/boards/login.html';
var PHOTO_SIZE = 'image_27x27';

var DEFAULT_COLUMNS = [{name: 'To Do:', id: -1},{name: 'In Progress:', id: -2},{name: 'Done:', id: -3}];

// Create a client.
var client = Asana.Client.create({
  clientId: CLIENT_ID,
  // By default, the redirect URI is the current URL, so for this example
  // we don't actually have to pass it. We do anyway to show that you can.
  redirectUri: REDIRECT_URI
});
// Configure the way we want to use Oauth. Popup flow is not a default
// so we must indicate specifically we want that type of flow.
client.useOauth({
  flowType: Asana.auth.PopupFlow
});
// When `authorize` is called it will pop up a window and navigate to
// the Asana authorization prompt. Most browsers block popups that do not
// open in direct response to a user action, so we trigger this function
// upon clicking a link rather than automatically.
function authorize() {
  $('#authorize').html('Authorizing...');
  client.authorize().then(function() {
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
        opt_fields: 'id,name,this.assignee.name,this.assignee.photo.' + PHOTO_SIZE + ',created_at,completed_at,completed,due_on,parent,this.tags.name,this.tags.color'
      })
  .then(function(collection) {
    $('#board').html('');
    collection.stream().on('data', function(task) {
      newSection = addTask(task, currentSection, project.id);
      if (newSection !== currentSection) {
		numSections++;
        sections.push(newSection);
        currentSection = newSection;
      }
      currentTasks.push(task);
      allTasks[task.id] = task;
    })
	if(numSections == 1){
		//Add some more default columns
	    for(var i = 0; i < DEFAULT_COLUMNS.length; i++){
	        if(currentSection.name != DEFAULT_COLUMNS[i].name){
		        createColumn(project.id, DEFAULT_COLUMNS[i]);
			}
		}
	}
  })
  .finally(function(){
    postBoardSetup();
  });
}


function preBoardSetup() {
  var firstOpening;
  var dialogEl;
  $( '#assigneeDialog' ).dialog({
    // dialogClass: 'no-title',
    autoOpen: false,
    title: 'Assign Task',
    width: '325px',
  /* The first time the dialog is opened it seems to receive the click.
   * The second times it's opened, it receives two clicks.
    open: function(e) {
      // find the dialog element
      dialogEl = $(this).parents('.ui-dialog')[0];
      firstOpening = true; // the first click we get is the dialog opening, we need to ignore that one
      $(document).click(function (e) { // when anywhere in the doc is clicked
        if (!firstOpening) {
          var clickedOutside = true; // start searching assuming we clicked outside
          $(e.target).parents().andSelf().each(function () { // search parents and self
              // if the original dialog selector is the click's target or a parent of the target
              // we have not clicked outside the box
              if (this == dialogEl) {
                  clickedOutside = false; // found
                  return false; // stop searching
              }
          });
          if (clickedOutside) {
            $( '#assigneeDialog' ).dialog("close");
            // unbind this listener, we're done with it
            $(document).unbind('click',arguments.callee);
          }
        } else {
          firstOpening = false;
        }
      });
    },
   */
  });
}


// returns the task associated with a child element of a card
function getTaskFromElement(child) {
  return allTasks[$( child ).closest('.card').prop('id')];
}

function postBoardSetup() {
  // renderChart(project, currentTasks);
  $(document).tooltip({position: { my: "left top+5", at: "center-40 bottom", collision: "flipfit" }});

  // handle card updates

  $('.tagRemove').click(function() {
    task = getTaskFromElement(this);
    tagElement = $( this ).closest('.tag');
    removeTag(task, tagElement.prop('id'));
    tagElement.remove();
  });
  $('.tagAdd').click(function() {
    task = getTaskFromElement(this);
    addTag(task, this);
  });
  $('.cardComplete').change(function() {
    getTaskFromElement(this).completed = $( this ).prop('checked');
  });
  $('.cardTitle').change(function() {
    getTaskFromElement(this).pretty_name = $( this ).val();
  });
  $('.cardValue').change(function() {
    getTaskFromElement(this).point_value = $( this ).val();
  });
  $('.card').change(function() {
    updateTask(getTaskFromElement(this));
  });
  $('.cardAssignee').click(function() {
    $( '#assigneeDialog' ).dialog({
      position: {
        my: "top+5",
        at: "center",
        of: $( this ).closest('.card'),
        collision: "flipfit"
      },
    });
    selectUser(getTaskFromElement(this));
  });

}

function addTask(task, currentSection, projectId) {
  if (':' == task.name.charAt(task.name.length-1)) {
    // we're a section
    currentSection = task;
    createColumn(projectId, currentSection);
  } else {
    // we're a task
	if (currentSection === undefined){
		//There is no current section
		currentSection = DEFAULT_COLUMNS[0];
		createColumn(projectId, currentSection);
	}
    createCard(task, '#' + currentSection.id + ' > .plus');
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

  $('#dropShadow').bind('dragover', function(event) {
    // Allow cards to be dropped onto the shadow
    event.stopPropagation();
    event.preventDefault();
  });
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
    + '</span>'
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

  var tags = '';
  if (task.tags) {
    tags = task.tags.map(function(tag){
      return newTagElement(tag);
    }).join('');
  }

  var card = $(beforeCard).before(
      '<div class="cardContainer" draggable="true" id="'
      + task.id + '">'
      + '<div class="cardPadding">'
      + '<div class="plus hidden">'
      + '<svg class="icon" viewBox="0 0 5 5" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M2 1 h1 v1 h1 v1 h-1 v1 h-1 v-1 h-1 v-1 h1 z" /></svg></div>'
      + '<div class="load hidden">'
      + '<svg class="icon" viewBox="0 0 2 2" xlmns="http://www.w3.org/2000/svg">'
      + '<circle cx="1" cy="1" r="1" /></svg></div>'
      + '</div>'
      + '<div class="card">'
      + '<div class="cardAssignee" >'
      + '<img id="assignee_img_' + task.id + '" src="'
      + getUserImage(task.assignee)
      + '" title="Click to assign"/>'
      + '</div>'
      + '<textarea class="cardTitle">'
      + taskName
      + '</textarea>'
      + '<span class="cardWidgets">'
      + '<input class="cardComplete" type="checkbox" />'
      + '<textarea class="cardValue" >'
      + taskValue
      + '</textarea>'
      + tags
      + '<a href="#" class="tagAdd">+</a>'
      + '</span>'
      + '</div>'
      + '</div>'
      );
  card.find('.cardComplete').prop('checked', task.completed);
  // $('#' + task.id + '_close').prop('checked', task.completed);

  $('#' + task.id ).bind('dragstart', function(event) {
    event.originalEvent.dataTransfer.setData("text/plain", event.target.getAttribute('id'));
    this.style.opacity = '0.4';
    dragSourceColumn = this.parentElement;
  });
  $('#' + task.id ).bind('dragend', function(event) {
    this.style.opacity = '1.0';

    // Remove any existent drop shadow when done dragging
    if (taskDropTarget) {
      removeDropShadow();
    }
  });

  $('#' + task.id ).bind('dragenter', function(event) {
    // Determine the card being dragged over
    var target;
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
  });

  addNewCardHandlers('#' + task.id + ' > .cardPadding',
                     '#' + task.id,
                     {'insert_before': task.id});

  // Add/remove plus icon from the resident column so it does not appear
  // when mouse is over a card
  $('#' + task.id).bind('mouseenter', function(event) {
    event.stopPropagation();
    $(this).parent().children('.plus').addClass('hidden');
  });
  $('#' + task.id).bind('mouseleave', function(event) {
    event.stopPropagation();
    $(this).parent().children('.plus').removeClass('hidden');
  });

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


function addNewCardHandlers(selectorString, beforeCard, projectOpts) {
  var load = $(selectorString + ' > .load');
  var plus = $(selectorString + ' > .plus');

  // On enter, show the plus icon unless already clicked
  $(selectorString).mouseenter(function(event) {
    if (load.hasClass('hidden')) {
      plus.removeClass('hidden');
    }
  });

  // On exit, hide the plus icon
  $(selectorString).mouseleave(function(event) {
    plus.addClass('hidden');
  });

  // If the plus icon is showing, create new task on click
  $(selectorString).click(function(event) {
    event.stopPropagation();
    if (!plus.hasClass('hidden') && load.hasClass('hidden')) {
      // Show the hidden icon, hide the plus icon
      load.removeClass('hidden');
      plus.addClass('hidden');
      // Animate the load icon
      var lower = function() { load.animate({'opacity':0}, 1000, higher); };
      var higher = function() { load.animate({'opacity':1}, 500, lower); };
      lower();

      // Create the task
      client.tasks.createInWorkspace(currentWorkspace.id).then(function(new_task) {
        var opts = $.extend(
          {
            'project': currentProject.id
          },
          projectOpts);
        client.tasks.addProject(
          new_task.id,
          opts
        ).then(function(object) {
          // Create the card
          createCard(new_task, beforeCard);
        }).finally(function(){
          // Hide the load icon
          load.addClass('hidden');
        });
      });
    }
  });
}



function updateTask(task) {
  var taskName = task.pretty_name;
  if (task.point_value) {
    taskName = '[' + task.point_value + '] ' + task.pretty_name;
  }
  console.log('Updating task ' + task.id);
  return client.tasks.update(
    task.id,
    {
      'name': taskName,
      'completed': task.completed,
    });
}

function updateAssignee(task) {
  console.log('Updating task assignee ' + task.id);
  $('#assignee_img_' + task.id).attr("src", getUserImage(task.assignee));
  return client.tasks.update(
    task.id,
    {
      'assignee': task.assignee.id,
    });
}

function removeTag(task, tagId) {
  console.log('Removing tag from task ' + task.id + ' tag=' + tagId);
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
  }).val('')
  .on('autocompleteselect', function(ev, ui) {
    console.log('Selection: ' + ui.item.label);
    client.tags.findById(
      ui.item.value,
      {
        opt_fields: 'id,name,color',
      }
      ).then(function(tag) {
        console.log('Full tag: ' + tag.name);
        console.log('Adding tag to task ' + task.id + ' tag=' + tag.id);
        client.tasks.addTag(
            task.id,
            {
              'tag': tag.id,
            });
        tagInput.before(newTagElement(tag));
        tagInput.remove();
      }, function(reason) {
        console.log('Exception: ' + reason);
      }).finally(function(){
        // not sure what this does, i probably copied it from some sample code.
        // However, itstarted getting an exception that destroy couldn't be called on an empty object.
        // $('#tag_typeahead_input').autocomplete('destroy');
      });
  });
}

function createColumn(projectId, section) {
  columnName = section.name.replace(':', '');
  $('#board').prepend( '<td class="column" id="' + section.id + '">'
      + '<div class="columnTitle">' + columnName + '</div>'
      + '<div class="plus hidden">'
      + '<svg class="icon" viewBox="0 0 5 5" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M2 1 h1 v1 h1 v1 h-1 v1 h-1 v-1 h-1 v-1 h1 z" /></svg></div>'
      + '<div class="load hidden">'
      + '<svg class="icon" viewBox="0 0 2 2" xlmns="http://www.w3.org/2000/svg">'
      + '<circle cx="1" cy="1" r="1" /></svg></div>'
      + '</td>');
  $('#' + section.id).bind('dragover', function(event) {
    event.preventDefault();
    if (taskDropTarget && taskDropTarget != this) {
      removeDropShadow();
    }
    if (!taskDropTarget) {
      addDropShadow(this, 'append');
    }
    // event.originalEvent.dataTransfer.dropEffect = 'move';
  });

  bindDropEventToColumn(projectId,section.id)
  // setup the columns to allow cards to be dropped in them.
  // reassign the card's task to a new section when dropped.

  $('#' + section.id).bind('drop', function(event) {
    var notecard = event.originalEvent.dataTransfer.getData("text/plain");
    // Object specifying where in the project this task should be placed
    var targetProject = {
      'project': projectId
    };
    // Add card to new column, before the task dragged over if applicable
    if (taskDropTarget && taskDropTarget != this) {
      targetProject['insert_before'] = $(taskDropTarget).attr("id");
      $(taskDropTarget).before(document.getElementById(notecard));
    } else {
      targetProject['section'] = this.id;
      $(this).children('.plus').before(document.getElementById(notecard));
    }
    event.preventDefault();
    
    moveTaskInAsana(notecard,targetProject);
  });

  addNewCardHandlers('#' + section.id, '#' + section.id + ' > .plus', {'section': section.id});
}

function bindDropEventToColumn(projectId,sectionId){
    $('#' + sectionId).bind('drop', function(event) {
      var notecard = event.originalEvent.dataTransfer.getData("text/plain");
      // Object specifying where in the project this task should be placed
      var targetProject = {
        'project': projectId
      };
      // Add card to new column, before the task dragged over if applicable
      if (taskDropTarget && taskDropTarget != this) {
        targetProject['insert_before'] = $(taskDropTarget).attr("id");
        $(taskDropTarget).before(document.getElementById(notecard));
      } else {
        targetProject['section'] = this.id;
        $(this).append(document.getElementById(notecard));
      }
	  //Asana api calls
	  //Add section if necessary and move card in asana
      event.preventDefault();
  	  if(this.id < 0){
  		  //User dragged card into a new section, need to create
  	  	  addSectionInAsana(findDefaultColumnName(this.id),notecard,targetProject,this.id);
  	  }else{
          // add to new project/section
          moveTaskInAsana(notecard,targetProject);
  	  }
    });
}

function findDefaultColumnName(defaultColumnId){
    for(var i = 0; i < DEFAULT_COLUMNS.length; i++){
        if(DEFAULT_COLUMNS[i].id == defaultColumnId){
	        return DEFAULT_COLUMNS[i].name;
		}
	}
	return;

}

function addSectionInAsana(sectionName,notecard,targetProject,oldSectionId){
	console.log('Adding section name:' + sectionName);
  	client.tasks.create(
		{
			'name':sectionName,
			'projects':[currentProject.id],
			'workspace':currentWorkspace.id
		}
	).then(function(section) {
       console.log('New section id:' + section.id);
	   if(targetProject['section'] != undefined){
		   targetProject['section'] = section.id;
	   }
	   moveTaskInAsana(notecard,targetProject)
	   //Change id in column html id and rebind drop event
	   $('#' + oldSectionId).attr("id",section.id);
	   bindDropEventToColumn(targetProject['project'],section.id)
       return section;
      }, function(reason) {
         console.log('Exception: ' + reason);
     });
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
  return 'head.png';
}

function selectUser(task){
  $('#assignee_popup_assign_to_me_button').button()
    .click(function(event){
      task.assignee = currentUser;
      updateAssignee(task);
      $( '#assigneeDialog' ).dialog("close");
    });
  $('#assigneeDialog').dialog('open');
  $('#assignee_popup_typeahead_input').autocomplete({
    source: userMatcher(),
  })
  .val('')
  .on('autocompleteselect', function(ev, ui) {
    console.log('Selection: ' + ui.item.label);
    client.users.findById(
      ui.item.value,
      {
        opt_fields: 'id,name,this.photo.' + PHOTO_SIZE,
      }
      ).then(function(user) {
        console.log('Full user: ' + user.name);
        task.assignee = user;
        return user;
      }, function(reason) {
        console.log('Exception: ' + reason);
      }).finally(function(user){
        updateAssignee(task);
        $( '#assigneeDialog' ).dialog("close");
        // not sure what this does, i probably copied it from some sample code.
        // However, itstarted getting an exception that destroy couldn't be called on an empty object.
        // Unhandled rejection Error: cannot call methods on autocomplete prior to initialization; attempted to call method 'destroy'
        $('#assignee_popup_typeahead_input').autocomplete('destroy');
      });
  });
}

function selectProject(){
  var projectInput = $('#projectSelector .typeahead');
  projectInput.autocomplete({
    source: projectMatcher(),
  })
  .val('')
  .on('autocompleteselect', function(ev, ui) {
    console.log('Selection: ' + ui.item.label);
    client.projects.findById(
      ui.item.value,
      {
        opt_fields: 'id,name,archived,created_at,modified_at,color,notes,workspace,team',
      }
      ).then(function(project) {
        console.log('Full project: ' + project.name + '[' + project.id + ']');
        currentProject = project;
        initBoard(project);
        projectInput.val(project.name);
      });
    projectInput.blur();
  });
  $('#projectSelector').css("visibility", "visible");
}

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
    console.log("Searching for " + request.term);
    client.workspaces.typeahead(
        currentWorkspace.id,
        {
          type: objectType,
          query: request.term,
        })
    .then(function(response) {
      responseCallback(response.data.map(function(u) {
        return {label: u.name, value: u.id};
      }));
    });
  }
};


function setupDemo() {
  preBoardSetup();
  var projectId = 1;
  var photo = {};
  photo[PHOTO_SIZE] = 'head.png';
  var user = { photo: photo };
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
