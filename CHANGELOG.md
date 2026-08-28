# Changelog

## 2026-08-28

Ten changes from the first round of team feedback.

### 1. Tasks now lead with a name, not an application tag
The **Application** field became **Task** — a short name that is now the card's
heading. What used to be the "Task" field became **Description**, shown as
secondary text underneath. The visual hierarchy is flipped: the name is what you
read first.

### 2. Description is optional
A task only needs a name. Leave the description empty and the card simply shows
the title, with no empty space where the text would be.

### 3. A task can have several assignees
Assignees moved from a single dropdown to a list you build: **−** on a chip
removes that person, **+ Add person** offers whoever is not on the task yet.
Cards show one avatar with a name, or overlapping avatars when several people
share the task (three, then `+N`).

### 4. "No description" no longer clutters project cards
Projects without a description just show their name. Progress bars and task
counts stay aligned across cards whether or not a description is present.

### 5. New "My tasks" view
A second tab collects everything assigned to you across every project, grouped
**To Do → In Progress → Done** and sorted by due date inside each group. Empty
groups are hidden. **Activity** moved to a text button on the far right of the
same row. With nothing assigned, the view suggests a coffee or a glass of wine.

### 6. A proper date picker
The browser's built-in calendar was replaced with one we control: roughly twice
the size, comfortable to tap, weeks starting on Monday, today outlined and the
selected day filled. **Not set** clears the date — a task can have no deadline —
and **Today** is one tap away.

### 7. Status colours swapped, with a flash on arrival
**In Progress** is now green and **Done** is violet. When a task lands in either
column its dot pulses for 1.5 seconds, so it is obvious where the card went.
The animation is skipped for anyone who has "reduce motion" enabled.

### 8. "Add project" moved to the top right
It now sits where **+ Add task** sits on a project screen, instead of occupying a
dashed tile in the grid. With no projects yet, the screen explains where to start.

### 9. Card and list views for projects
A toggle next to **Add project** switches between the card grid and a compact
list — easier to scan once there are a lot of projects. Your choice is
remembered between visits. Narrow screens drop the progress column so names stay
readable.

### 10. Key points on a project
Projects can carry any number of **key points** — the things the team must not
forget. They appear under the project title in an accent colour with a glowing
dot, alongside the description (which previously was not displayed at all on the
project screen). Optional: a project without key points shows nothing extra.

### Fixes along the way
- Overdue tasks were shown as "due today" in Korean time. Dates are now read as
  local dates, so overdue reads as overdue.
- Errors were swallowed by a generic message; the underlying cause is now logged
  to the browser console.
- The key-point input inherited the modal's field styling, which gave it a double
  border and dead space. Its own styling now wins.
- Dropdown arrows sat jammed against the right edge because they were the
  browser's own. They are drawn now: a chevron inside a translucent circle,
  properly inset.

### Database migrations
Run `sql/migrations/001`, `002` and `003` in order before deploying this version.
They add `tasks.description`, the `task_assignees` table (carrying existing
assignees over), and `projects.key_points`.
