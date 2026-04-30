# Share To Wall And Profile Wall Integration Spec

## Purpose

Define the safest way to add:

- `Share to my wall` from a post card
- a real user wall inside Profile
- a clean separation between external sharing and in-app reposting

This spec is intentionally written before code. The current app does not yet have a wall data model, and the current share flow is not suitable to extend blindly.

## Current State

### Mobile app

- Post cards expose a share button through `data-share-post`.
- `sharePost(postId)` currently does external sharing only:
  - native share when available
  - clipboard fallback otherwise
- local share activity is stored in `state.sharedPosts` and used for local notification/history only.
- Profile currently shows account summary, auth, settings entry, and connection status.
- There is no dedicated wall section in Profile yet.

### Backend

- Social posts are stored as canonical feed posts.
- Reaction handling currently treats `shares` and `saves` as the same underlying actor list.
- This means the current backend share/save metric path is not safe to reuse for profile wall reposts.

## Product Decision

### Recommendation

Profile and wall should be integrated at the UI level, but not merged into one data object.

That means:

- `Profile` stays the user identity and account page
- `Wall` becomes a first-class section inside Profile
- the wall displays:
  - posts authored by the user
  - reposts the user chose to place on their wall

This is the cleanest direction because it matches how users think, while keeping the data model maintainable.

### Share behavior

The post card share button should become an action menu with at least two actions:

- `Share externally`
- `Share to my wall`

Do not make `Share to my wall` a side effect of native/browser share. They are different actions and should be tracked separately.

## Scope

### In scope for v1

- add `Share to my wall` as an in-app action
- add a wall section inside Profile
- show authored posts and reposted posts in one wall feed
- allow a user to remove their repost from their wall
- preserve attribution to the original post author

### Out of scope for v1

- quote-posts with custom commentary
- privacy levels beyond the current app defaults
- threaded repost conversations
- cross-device external share analytics
- redesigning the full Profile page structure beyond what is needed for the wall section

## UX Specification

### 1. Post card share interaction

Current:

- tapping share immediately invokes external share behavior

Target:

- tapping share opens a small action sheet/menu
- actions:
  - `Share externally`
  - `Share to my wall`
  - `Cancel`

Behavior:

- `Share externally`
  - runs the current native share / clipboard behavior
  - does not create a wall post
- `Share to my wall`
  - creates an in-app repost entry
  - confirms with toast: `Added to your wall.`
  - updates the Profile wall immediately

### 2. Profile page structure

Recommended structure:

- profile summary header
- account/auth block
- segmented switch or tab row:
  - `Overview`
  - `Wall`
- settings entry

Behavior:

- `Overview` keeps the current summary-oriented experience
- `Wall` shows the user’s authored posts and reposts in reverse chronological order

### 3. Wall card behavior

For authored posts:

- render like a normal post card

For reposts:

- show a small repost label above the source post
- include:
  - `Shared by you`
  - timestamp of repost
- render the original post card content beneath that label

### 4. Wall management

For repost entries:

- provide `Remove from wall`
- removing the repost only removes the wall entry
- it must not delete or modify the original post

For authored posts:

- no change in this spec
- authored post management stays separate

## Data Model

### Decision

Do not reuse the current `shares` / `saveActorIds` path for wall reposts.

Reason:

- that path is currently coupled to save/share reaction behavior
- it is not a clean representation of wall ownership
- reusing it would create confusing counts and make later maintenance harder

### Recommended v1 model

Keep canonical feed posts as they are, and add a new repost model.

#### `social_posts`

Existing canonical posts:

- one record per original feed post
- authored by the original post owner

#### `social_reposts`

New model:

- `id`
- `actorId`
- `userId`
- `sourcePostId`
- `createdAt`

Optional later fields:

- `note`
- `visibility`
- `sourceSnapshot`

### Wall assembly rule

The Profile wall is assembled from:

- original posts where `post.actorId === profileActorId`
- repost entries where `repost.actorId === profileActorId`

Then sort the combined wall feed by wall event time descending:

- original post uses `post.createdAt`
- repost uses `repost.createdAt`

## API Specification

### 1. Create repost

`POST /social/posts/:id/reposts`

Body:

- `actorId`
- `userId`

Response:

- created repost entry
- wall item payload if convenient

Validation:

- require authenticated user for persisted reposts
- reject duplicate repost by the same actor for the same source post
- reject missing source post

### 2. Remove repost

`DELETE /social/reposts/:id`

Validation:

- only the repost owner can delete it

### 3. Fetch wall

`GET /social/wall/:actorId`

Response:

- `items: []`
- each item includes:
  - `type: authored | repost`
  - `wallCreatedAt`
  - source post data needed for rendering
  - repost metadata when applicable

## Counter And Metric Rules

### Important rule

External shares and wall reposts are not the same metric.

Recommended v1 handling:

- keep external share flow for browser/native share
- do not treat browser/native share as a reliable social count
- wall reposts should have their own persisted count if shown

### Safer metric direction

Long term:

- `saves` should be separate from `shares`
- `reposts` should be separate from both

For this codebase, the safest first implementation is:

- keep current share button count untouched until repost persistence is ready
- once reposts exist, decide whether the visible share count should represent reposts only

## Frontend Implementation Plan

### Phase A: share action menu

- replace direct share click with share menu
- keep current external share behavior intact
- add wall-share action entry point

### Phase B: repost persistence

- add repost create/delete endpoints
- wire `Share to my wall`
- update local wall state after create/delete

### Phase C: Profile wall UI

- add `Overview / Wall` switch in Profile
- render authored posts + repost entries in wall order
- allow removing reposts

### Phase D: metric cleanup

- decide final on-card share/repost count behavior
- remove dependence on device-local `sharedPosts` as a social metric

## Acceptance Criteria

### Product

- user can tap share on a post and choose `Share to my wall`
- shared-to-wall post appears in the user’s Profile wall
- original post attribution is preserved
- user can remove a repost from their wall
- removing a repost does not affect the original post

### Technical

- original feed posts remain canonical
- reposts are stored independently
- wall rendering works from authored posts plus repost entries
- no coupling between external share success and wall repost creation

## Risks

### 1. Reusing the current share/save metric path

Risk:

- incorrect counters
- broken semantics
- harder future maintenance

Mitigation:

- create a separate repost model

### 2. Overloading Profile with too much UI

Risk:

- Profile becomes cluttered

Mitigation:

- use `Overview / Wall` switch
- do not dump wall content into the current summary layout without structure

### 3. Rendering reposts from mutable source posts

Risk:

- if a source post is deleted or malformed, wall item breaks

Mitigation:

- v1 may hide invalid reposts gracefully
- later add lightweight source snapshot if needed

## Recommended Build Order

1. Build the share action menu
2. Add repost backend model and routes
3. Add Profile wall UI
4. Add remove-repost action
5. Revisit share/repost counters

## Explicit Non-Decision

This spec does not yet define quote-posts.

Reason:

- quote-posts add composer, moderation, and wall rendering complexity
- `Share to my wall` should ship first as a simpler repost action

## Summary

The correct approach is:

- integrate wall into Profile at the page level
- keep original posts and reposts as separate data concepts
- split external share from wall repost explicitly
- build wall functionality as a dedicated feature, not as an extension of the current device-local share counter
