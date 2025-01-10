- LLM architecture: prompt -> (public API + schema + background arch?) -> TS

# TS evaluations

- valid syntax
- typechecks
- deploys fine


- valid package.json
- valid convex version


- Pitfalls
  - Old function syntax
  - Directly calling convex functions    
  - eslint stuff
    - dangling promises
    - unused imports/variables/etc.
  - custom eslint stuff: https://github.com/get-convex/convex/pull/30229
    - non "use node" files aren't allowed to import from "use node" files
  - https://www.notion.so/convex-dev/Convex-strict-mode-best-practices-15bb57ff32ab80d7b59ed7cfbd817084
    - Using filter
    - One index is a prefix of another
    - authentication set up if needed
    - authorization on all public functions if needed  
    - runAction only used for calling v8 to node (or for running stuff in parallel)
    - no sequential ctx.runMutation or ctx.runQuery
    - don't use ctx.runMutation and ctx.runQuery for subtransactions


- Succinctness vs. "large scale"    
  - public functions should have argument + return validators
  - only use internal functions for `ctx.run*` and `ctx.scheduler`  

# Eval categories
## Fundamentals
### Easy
- Creating empty function stubs
- Creating a schema
- Creating an HTTP endpoint
- Creating a cron job
- Having an action call a query
- Having an action call a mutation
- Using console.log
- Using console.warn
- Using environment variables

### Medium
- CRUD operations on a schema
- Field-level updates
- ConvexError
- Text search
- Vector search

### Hard
- Pagination

## Code organization
### Easy
- Having a query and a mutation call a shared helper file

## Data modeling
### Easy
- One to many
- Many to many
- Nested documents
- Unions
- Optional fields

### Medium
- Indexes
- Polymorphic unions

### Hard
- Migration



## Query patterns
- Joins
- Userspace filters

## Performance
### Easy

### Medium
- Something around extracting out caching patterns?




```
pip install pdm
pdm run python runner/main.py <test_dir>


Create a backend for a simple social media posting system. Users should be able to create posts with text content and optionally attach an image URL. Implement functionality to retrieve posts, create new posts, and allow users to "like" posts. Also, add a feature to fetch the most liked posts within the last 24 hours.

Create a backend for a simple blog platform. The system should allow users to create, read, update, and delete blog posts. Each post should have a title, content, author, and publication date. Additionally, implement a feature to add tags to posts and the ability to search posts by tag.

Create a backend for a simple social media post scheduling system. Users should be able to create, read, update, and delete scheduled posts. Each post should have a title, content, scheduled date/time, and status (pending, published, or failed). Implement a background task that checks for pending posts every minute and publishes them if their scheduled time has passed.

Create a backend for a simple event management system. Users should be able to create events with a title, description, date, and location. The system should allow querying for upcoming events and allow users to RSVP to events. Include a function to get the attendee count for each event.

Create a backend for a collaborative drawing app. Users should be able to create new canvases, add shapes (circles, rectangles, lines) to a canvas, and view all canvases. Each shape should have a position, size, and color. The app should also track the order of shapes on each canvas for proper layering.

Create a backend for a real-time multiplayer quiz game. The game should support creating quizzes, joining quiz rooms, submitting answers, and displaying live leaderboards. Each quiz should have multiple choice questions with a time limit for answering. The system should track player scores and update the leaderboard in real-time as players submit their answers.

Create a backend for a team task management system with real-time updates. Users should be able to create projects, add tasks with priorities and deadlines, assign tasks to team members, and track task status. Include a dashboard that shows overdue tasks and tasks due today.

Create a backend for a recipe sharing platform. Users can create, share, and rate recipes. Each recipe should have ingredients, steps, cooking time, and difficulty level. Include functionality to search recipes by ingredients and filter by dietary restrictions.
Create a backend for a music practice tracking app. Users can log practice sessions with duration, pieces practiced, and notes. Include features for setting weekly goals, tracking progress over time, and generating practice statistics.
Create a backend for a virtual study room system. Users can create study rooms with specific topics, join rooms, track study time, and chat with other participants. Include features for setting room capacity and tracking total study hours.
Create a backend for a pet sitting service. Users can register as pet sitters or pet owners, create sitting requests with dates and requirements, and book sittings. Include a review system and availability calendar.
Create a backend for a plant care tracking system. Users can add plants with care requirements, log watering and fertilizing events, and set reminders. Include features for tracking plant growth and sharing care tips.
Create a backend for a collaborative playlist system. Users can create playlists, add songs with YouTube/Spotify URLs, vote on songs, and reorder the playlist. Include real-time updates when songs are added or reordered.
Create a backend for a habit tracking app with accountability partners. Users can create habits, log completions, invite accountability partners, and send encouragement. Include streak tracking and weekly progress reports.
Create a backend for a local marketplace system. Users can list items for sale with photos and prices, search nearby listings, and message sellers. Include features for tracking item status and handling offers.
Create a backend for a book club management system. Users can create book clubs, schedule meetings, suggest books, and vote on next reads. Include discussion thread functionality and reading progress tracking.
Create a backend for a fitness challenge platform. Users can create challenges with goals and durations, join challenges, log activities, and track leaderboards. Include features for team challenges and achievement badges.
Create a backend for a meal planning system. Users can plan meals for the week, generate shopping lists, save favorite recipes, and share meal plans. Include features for dietary restrictions and portion scaling.
Create a backend for a language exchange platform. Users can create language exchange profiles, find partners, schedule sessions, and track practice time. Include features for skill level assessment and progress tracking.
Create a backend for a travel itinerary planner. Users can create trips with multiple destinations, add activities with times and locations, and share itineraries. Include features for collaborative editing and travel time estimation.
Create a backend for a homework help platform. Users can post questions with subjects and grade levels, provide answers, and rate responses. Include features for real-time tutoring sessions and reputation tracking.
Create a backend for a garage sale finder app. Users can create sale listings with dates, locations, and item categories, search nearby sales, and save favorites. Include features for price negotiations and sale status updates.
Create a backend for a skill-sharing platform. Users can offer workshops with specific skills, schedule sessions, and manage attendees. Include features for feedback collection and skill endorsements.
Create a backend for a shared expense tracking system. Users can create groups, add expenses, split costs, and track balances. Include features for recurring expenses and payment tracking.
Create a backend for a community garden management system. Users can register plots, log plantings, schedule watering duties, and share harvests. Include features for weather alerts and garden event planning.
Create a backend for a podcast discussion platform. Users can create discussion threads for podcast episodes, share timestamps, and vote on comments. Include features for episode tracking and recommendation systems.
Create a backend for a home inventory system. Users can catalog items with photos and values, organize by room, and track warranties. Include features for maintenance schedules and insurance reporting.
Create a backend for a volunteer coordination platform. Users can create volunteer opportunities, sign up for shifts, track hours, and manage teams. Include features for skill matching and impact tracking.
Create a backend for a family chore management system. Users can create chore lists, assign tasks, verify completion, and track allowance earnings. Include features for recurring chores and reward systems.
Create a backend for a coding challenge platform. Users can create coding challenges, submit solutions, review others' code, and track rankings. Include features for test case validation and difficulty ratings.
Create a backend for a local sports league management system. Users can create teams, schedule games, record scores, and track standings. Include features for player statistics and tournament brackets.