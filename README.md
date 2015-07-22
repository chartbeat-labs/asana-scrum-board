### Asana Scrum Boards

This is an alternative HTML5 Web front-end to Asana.  It allows you to view an Asana 
project as a scrum board.

The different sections on your Project will be used as columns on the scrum
board and each task will be placed as a card in the section's column.

On the main board, cards can be dragged between columns and re-ordered,  
task descriptions and point values can be edited and task assignee can be
changed by clicking the assignee icon.  In addition, pop-up window allows
you to view/edit other attributes of the task such as the full description,
comments and tags.

Story points are automatically retrieved from existing Asana tasks.  Any
number surrounded by [brackets] will be used as a point value.  When tasks
are saved back to asana the point values are placed at the start of the
task taitle surrounded by brackets.

A public demo of this Asana front-end is available here: https://hacks.chartbeat.com/asana

### Local Installation

#### Running with Django

Inside the asana directory, run:

```
python manage.py runserver
```

From a brower, browse to http://127.0.0.1:8000/static/boards/index.html

#### Non Django Setup

Alternately, django is not really required.  All the files in 
asana/boards/static/boards can be placed on a web server and run from there.  

#### Asana Setup

To setup Asana access, create a new `App` in your Asana Profile Settings.
Use the location of the `index.html` file for the *App URL* and the
location of `login.html` for the *Redirect URL*.  Change index.js to include 
the Client ID and redirect URL as defined by the new App.

You can override the default client_id/redirect_uri by settings the following
localStorage values in the javascript console:


  localStorage.asanaClientId = your_client_id;
  localStorage.asanaRedirectUri || 'https://your_redirect_url/login.html';
