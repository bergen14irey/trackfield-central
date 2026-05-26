[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/jPYUvTgU)
# Semester Project

## Putting it all together
You will be tasked with creating a functioning website, including both a frontend and a backend. Your project will need to fulfill a list of requirements, but these requirements are by no means the be-all and end-all of what the project needs to be. Feel free to go as big as you would like, as long as you do everything I ask. This project is to demonstrate that you understand the concepts of everything that has been covered in the semester and that you can build not just a functioning website, but also one that is generally appealing.

## Assignment Details
The frontend will require you to make at least 3 HTML pages. These pages must all be styled to look acceptable on the internet. Among these pages there must be a form of some kind. This form will need to be properly validated with JavaScript, and this validation must provide adequate feedback for the user. When you submit this form should send information to the backend and then redirect the user to another page. It also needs to be a mobile friendly site. This includes appropriate font sizes, shifting the layout, and removing elements that don't really make sense on a mobile site. This includes a navbar that converts itself into a mobile-style menu. When styling, keep in mind accessibility. Although we didn't talk a lot about it, is an important aspect of development that is relatively simple to integrate into the site. What I am looking for is appropriate colors, alternate text on images, and using semantic elements. None of these HTML/CSS files can be from earlier assignments. I want a unique project, not a nav bar navigating to assignments 1-3.

The backend is how all of your frontend pages will be served and data will be handled. Using Express you should serve every file that a user needs access to. This includes HTML, CSS, JavaScript, and images. There should also be an API with at least 3 routes that allows the frontend to retrieve data from the database. At least 2 of these should be used in the frontend, one to submit form data and one to retrieve the information. The database itself can be structured however you would like.

 The project should fit a general theme. It can generally be whatever you'd like, whether it be a website for a friend or family's business, informational site about a game or movie, or something else entirely. If you have any questions on what I am expecting for this project please ask and I can address it, odds are if you have that question so does somebody else.

## Requirements
### Frontend (50 points)
**HTML**
- At least 3 pages
	- Pages should link to each other
	- Each page should have a tab title
- A navigation bar
- A table
- A list
- At least 1 local and 1 remote image (at least 2 total images)
- Use of semantic elements
- A link to an external website
- A form at least 4 of the 6 following input types
	- Text input
	- Textarea
	- Checkboxes
	- Radio buttons
	- Dropdown selects
	- A special `type` of input (email, date, etc)
**CSS**
- Background color(s)
- Styled links in the navbar
- Use of flex or grid
- Proper responsive design
	- Layout should change accordingly
	- Elements may need to be removed
	- The navbar should change to a mobile-style menu
- Styled form errors
**JavaScript**
- Properly handled form validation
- Make a fetch call to the backend. Display this data on a page
- Any other JS you think you might need
### Backend (30 points)
- Handle serving all necessary frontend files
- Accept input from a form using either a form or JSON body
	- This input should be stored in the database
	- The form should be submit with the `post` method
- Create an API with at least 3 routes
	- At least 2 of these routes should be used in the frontend
### Reminders
- Properly handle links. External links require extra steps that internal ones shouldn't do
- Adhere to proper JavaScript syntax
- Take care when defining paths to different resources
- Make sure to handle numbers appropriately
- We aren't using the VS Code live server extension. While you can use it during development, the finished result should use exclusively your backend
