// var Asana = require('asana');
// var util = require('util');

var dragSourceColumn;
var currentWorkspace;
var currentUser;
var CLIENT_ID = 35463866756659;
var REDIRECT_URI = 'http://127.0.0.1:8000/static/boards/login.html';
var PHOTO_SIZE = 'image_27x27';
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
  preBoardSetup();

  var userId = currentUser.id;
  var workspaceId = currentUser.workspaces[0].id;
  client.tasks.findByProject(
      project.id,
      {
        opt_fields: 'id,name,this.assignee.name,this.assignee.photo.' + PHOTO_SIZE + ',created_at,completed_at,completed,due_on,parent'
      }).then(function(response) {
        $('#board').html('');
        return client.all(response);
      })
  .each(function(task) {
    newSection = addTask(task, currentSection, project.id);
    if (newSection !== currentSection) {
      sections.push(newSection);
      currentSection = newSection;
    }
    currentTasks.push(task);
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

function postBoardSetup() {
    // renderChart(project, currentTasks);
    $(document).tooltip({position: { my: "left top+5", at: "center-40 bottom", collision: "flipfit" }});
}

function addTask(task, currentSection, projectId) {
  var currentSection;
  if (':' == task.name.charAt(task.name.length-1)) {
    // we're a section
    currentSection = task;
    createColumn(projectId, currentSection);
  } else {
    // we're a task
    createCard(currentSection, task);
  }
  return currentSection;
}

function createCard(section, task) {
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

  $('#' + section.id).append(
      '<div class="card" draggable="true" id="'
      + task.id + '">'
      + '<div class="cardAssignee" >'
      + '<img id="assignee_img_' + task.id + '" src="'
      + getUserImage(task.assignee)
      + '" title="Click to assign"/>'
      + '</div>'
      + '<textarea class="cardTitle" id="'
      + task.id + '_name' + '">'
      + taskName
      + '</textarea>'
      + '<div class="cardWidgets">'
      + '<input type="checkbox" id="'
      + task.id + '_close' + '" />'
      + '<textarea class="cardValue" id="'
      + task.id + '_value' + '">'
      + taskValue
      + '</textarea>'
      + '</div>'
      + '</div>'
      );
  $('#' + task.id ).bind('dragstart', function(event) {
    event.originalEvent.dataTransfer.setData("text/plain", event.target.getAttribute('id'));
    this.style.opacity = '0.4';
    dragSourceColumn = this.parentElement;
  });
  $('#' + task.id ).bind('dragend', function(event) {
    this.style.opacity = '1.0';
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
  $('#' + task.id + '_close').prop('checked', task.completed);
  $('#' + task.id ).bind('change', function(event) { updateTask(task) });

  $('#assignee_img_' + task.id).click(function(event) {
    $( '#assigneeDialog' ).dialog({
      position: {my: "top+5", at: "center", of: '#' + task.id, collision: "flipfit" },
    });
    selectUser(task);
  });
}

function updateTask(task) {
  // save changes to the text
  var taskName = $('#' + task.id + '_name' ).val();
  var taskValue = $('#' + task.id + '_value' ).val();
  var taskStatus = $('#' + task.id + '_close' ).prop('checked');
  if (taskValue) {
    taskName = '[' + taskValue + '] ' + taskName;
  }
  return client.tasks.update(
    task.id,
    {
      'name': taskName,
      'completed': taskStatus,
    });
}

function updateAssignee(task) {
  console.log('updating task ' + task.id);
  $('#assignee_img_' + task.id).attr("src", getUserImage(task.assignee));
  return client.tasks.update(
    task.id,
    {
      'assignee': task.assignee.id,
    });
}

function createColumn(projectId, section) {
  columnName = section.name.replace(':', '');
  $('#board').prepend( '<td class="column" id="' + section.id + '">'
      + '<div class="columnTitle">' + columnName + '</div>'
      + '</td>');
  $('#' + section.id).bind('dragover', function(event) {
    event.preventDefault();
    // event.originalEvent.dataTransfer.dropEffect = 'move';
  });

  // setup the columns to allow cards to be dropped in them.
  // reassign the card's task to a new section when dropped.
  $('#' + section.id).bind('drop', function(event) {
    // don't try dragging onto the existing column
    if (this != dragSourceColumn) {
      var notecard = event.originalEvent.dataTransfer.getData("text/plain");
      event.target.appendChild(document.getElementById(notecard));
      event.preventDefault();
      targetSectionId = this.id;
      // add to new project/section
      client.tasks.addProject(
        notecard,
        {
          'section': targetSectionId,
          'insertBefore': null,
          'project': projectId,
        });
    }
  });
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
  });
  $('#assignee_popup_typeahead_input').val('');
  $('#assignee_popup_typeahead_input').on('autocompleteselect', function(ev, ui) {
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
        $( '#assigneeDialog' ).dialog("close");
        $('#assignee_popup_typeahead_input').autocomplete('destroy');
      });
  });
}

function selectProject(){
  $('#projectSelector .typeahead').typeahead({
    hint: true,
    highlight: true,
    minLength: 1
  },
  {
    name: 'projects',
    source: projectMatcher(),
    display: 'name',
  });
  $('#projectSelector .typeahead').bind('typeahead:select', function(ev, projectCompact) {
    console.log('Selection: ' + projectCompact.name);
    client.projects.findById(
      projectCompact.id,
      {
        opt_fields: 'id,name,archived,created_at,modified_at,color,notes,workspace,team',
      }
      ).then(function(project) {
        console.log('Full project: ' + project.name);
        initBoard(project);
      })
  });
  $('#projectSelector').css("visibility", "visible");
}

var projectMatcher = function() {
  return function(q, syncResults, asyncResults) {
    client.workspaces.typeahead(
        currentWorkspace.id,
        {
          type: 'project',
          query: q,
        })
    .then(function(response) {
      asyncResults(response.data);
    });
  }
}

var userMatcher = function() {
  return function(request, responseCallback) {
    console.log("Searching for " + request.term);
    client.workspaces.typeahead(
        currentWorkspace.id,
        {
          type: 'user',
          query: request.term,
        })
    .then(function(response) {
      responseCallback(response.data.map(function(u) {
        return {label: u.name, value: u.id};
      }));
    });
  }
}


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
    },
    {
      name: '[13] Learn Python',
      id: 22,
      assignee: user,
      completed: true,
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
      name: 'In Progress:',
      id: 3,
      assignee: user,
    },
    {
      name: '[3] Learn Django',
      id: 4,
      assignee: user,
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
    },
    {
      name: '[.5] Lorum ipsum bacon dolar.',
      id: 7,
      assignee: user,
    },
    {
      name: '[11] Learn HTML5',
      id: 9,
      assignee: user,
    },
    {
      name: '[8] Learn Angular',
      id: 11,
      assignee: user,
    },
    {
      name: '[8] Learn CSS',
      id: 12,
      assignee: user,
    },
    {
      name: '[3] Learn HTML5',
      id: 13,
      assignee: user,
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
