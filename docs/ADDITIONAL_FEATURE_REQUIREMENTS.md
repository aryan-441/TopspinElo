Table Tennis App — Additional Feature Requirements
Project Context
This is an expansion of the existing Table Tennis Tournament Management Application.

The application already has a Python-based backend for players, games, matches, tournaments, point-by-point scoring, and event tracking. It is being developed into a comprehensive tournament management platform, initially with a desktop GUI and eventually as a web application.

Implement the following features while preserving existing functionality, data structures, and compatibility wherever possible.

Important architectural principle: Tournament organizers must retain complete manual control over tournament data, draws, match assignments, scores, and progression. Automated functionality should assist organizers rather than restrict them.

Do not rewrite working components unnecessarily. Review the existing codebase before proposing modifications.

Feature 1: Optional Player Attributes
Current functionality
When creating a player, the application allows users to specify:

Dominant hand: Left-handed or right-handed.
Grip: Shakehand or penhold.
Playing style: Attacker, defender, or all-rounder.
Required changes
All three attributes must become optional.

Users should be able to:

Select an available option.
Leave any individual attribute blank.
Create a player without specifying any of these attributes.
Edit or add missing attributes later through the player’s profile.
Technical requirements
Represent unspecified attributes consistently, preferably using None internally and NULL in a database.
Do not substitute arbitrary defaults such as right-handed or attacker.
Ensure missing attributes do not cause errors in player creation, serialization, database operations, match creation, or statistical calculations.
Ensure statistical filters exclude unknown values appropriately rather than treating them as known categories.
Maintain compatibility with existing player records.
Feature 2: Group-Stage Tournament System
Overview
In addition to knockout tournaments, introduce a flexible group-stage tournament system.

The application must support:

Pure knockout tournaments.
Group-stage tournaments.
Group-stage tournaments followed by knockout rounds.
Organizers must be able to customize the structure of the tournament.

2.1 Configurable groups
Allow organizers to specify:

Total number of participating players.
Number of groups.
Number of players in each group.
Number of players qualifying from each group.
Group-stage match format (best-of-3, best-of-5, etc.).
Qualification and tie-breaking rules.
Whether the tournament ends after the group stage or proceeds into knockout rounds.
Examples:

Example A

40 participants divided into 10 groups of 4.

The top player from each group qualifies.

10 players advance to the next stage.

Example B

40 participants divided into 4 groups of 10.

The top 2 players from each group qualify.

8 players advance to the knockout stage.

Example C

40 participants divided into 4 groups of 10.

The top 3 players from each group qualify.

12 players advance to the knockout stage.

The application must not restrict tournaments to these examples.

Support uneven group sizes where necessary, such as 38 participants distributed across 8 groups.

Validate configurations and explain any inconsistencies without unnecessarily restricting manual customization.

2.2 Seeded group generation
Implement automatic group generation based on player seedings.

The primary objective is to distribute strong players fairly and prevent the highest-seeded players from being concentrated in the same group.

Requirements:

Distribute the highest seeds across different groups wherever possible.
Use a configurable seeded distribution method, such as serpentine or snake seeding.
Randomize eligible placements within seeding bands when requested.
Support unseeded players.
Support both completely random and seeded-random group generation.
Allow organizers to preview the generated groups before confirming them.
Permit regeneration without deleting player registrations.
The seeding algorithm must be documented, deterministic when a random seed is supplied, and testable.

2.3 Manual group editing
Unlike the knockout PDF importer, group-stage tournaments do not initially require computer vision.

Instead, create a simple and powerful manual group editor.

Organizers must be able to:

Create groups manually.
Rename groups (Group A, Group B, etc.).
Add or remove groups.
Add or remove players.
Move players between groups.
Swap two players.
Change the number of qualifiers per group.
Edit group composition through a straightforward text-based interface.
Override automatically generated group assignments.
Provide an editable text representation, for example:

Group A:

Player A
Player B
Player C
Player D
Group B:

Player E
Player F
Player G
Player H
Changes made in the editor should update the underlying tournament structure after validation.

Use stable player IDs internally, not player names alone, because multiple players may have identical names.

If a change affects already-played matches, show the consequences and offer a safe, explicit correction workflow rather than silently deleting results.

2.4 Group-stage matches and standings
The system should automatically generate matches within each group.

Default format: Round robin, where each player competes against every other player in their group once.

Support configurable repeat encounters in the future.

Track:

Matches played.
Matches won.
Matches lost.
Games won and lost.
Points won and lost.
Game difference.
Point difference.
Win percentage.
Group position.
Qualification status.
Group standings should update automatically after completed matches.

Tie-breaking rules must be configurable and clearly displayed. Support head-to-head results, game difference, point difference, and additional criteria as appropriate.

For multi-player ties, apply a documented mini-table procedure where required. Do not assume a simple two-player head-to-head comparison resolves every tie.

Allow authorized organizers to override rankings and qualification decisions, recording the reason and maintaining an audit history.

2.5 Progression into knockout stages
Once group-stage matches are completed, automatically determine qualifying players based on the configured rules.

The system should then generate a knockout draw.

Requirements:

Support different numbers of qualifiers.
Handle non-power-of-two qualifier counts using BYEs where necessary.
Seed the knockout draw using group results or configured original seedings.
Avoid immediate rematches between players from the same group where feasible.
Allow organizers to preview, manually edit, or replace the generated knockout draw.
Do not finalize progression without organizer confirmation.
Preserve all group-stage results and statistics.
The existing knockout tournament engine and PDF draw importer should remain available.

Feature 3: Organizer and Referee Accounts
Overview
When the application becomes a website, implement an account system with role-based access control (RBAC).

The system must distinguish between organizers, referees, and platform administrators.

3.1 Organizer accounts
Organizers should be able to:

Create and manage tournaments.
Register and manage players.
Generate and edit draws.
Configure group stages.
Assign referees to matches.
View all matches in their tournaments.
Edit schedules, scores, results, and progression.
Manage tournament settings.
View tournament statistics.
Export tournament data and event logs.
Resolve scoring or tournament-management errors.
Organizers should have comprehensive control over tournaments they own or have been explicitly authorized to manage.

They must not automatically gain access to unrelated tournaments.

3.2 Referee accounts
Referees should be able to create accounts and join tournaments through an organizer-issued invitation code.

Invitation workflow:

An organizer creates a tournament.
The organizer generates a referee invitation code.
The referee signs in or creates an account.
The referee enters the invitation code.
The application associates the referee with the appropriate tournament.
The organizer assigns one or more matches to that referee.
The referee can access the assigned matches.
Invitation codes should be securely generated, expire when appropriate, be revocable, and have configurable usage limits.

Do not use invitation codes as permanent authentication credentials.

3.3 Referee permissions
Referees should only have access to matches assigned to them.

For assigned matches, they should be able to:

Start a match.
Record points.
Record faults and lets.
Undo or correct points according to scoring rules.
View the current score.
View the current server.
Complete the match.
Submit the final result.
Access relevant match history.
Referees must not be able to:

Modify tournament-wide settings.
Modify other referees’ matches.
Change tournament draws.
Delete tournaments.
Modify organizer accounts.
Access unrelated tournament information or private player data.
Access developer administration functions.
Organizers should be able to revoke referee access or reassign matches at any time.

3.4 Match assignment system
Create an organizer interface showing:

All tournament matches.
Assigned referees.
Unassigned matches.
Match status.
Match schedules.
Allow organizers to assign, unassign, and reassign referees.

A referee’s dashboard should display only their assigned matches and the information required to officiate them.

The architecture should support multiple referees participating in the same tournament simultaneously.

Prevent conflicting simultaneous scoring operations using appropriate server-side concurrency controls.

Feature 4: Developer Administration Panel
Overview
Implement a separate, protected developer administration panel.

This panel is intended for the platform owner/developer, not ordinary tournament organizers.

The developer administrator must have platform-level management and monitoring capabilities.

4.1 Platform overview
Provide an overview dashboard showing metrics such as:

Total registered accounts.
Active users.
Total organizers.
Total referees.
Total tournaments created.
Active tournaments.
Completed tournaments.
Total matches recorded.
Total points recorded.
Platform usage over time.
Where useful, provide charts and filters by date range.

4.2 User and tournament management
The developer administrator should be able to:

Search for accounts.
View account roles and statuses.
Suspend or reactivate accounts.
Review tournament metadata.
Investigate reported issues.
Manage platform-wide settings.
Review account and tournament activity.
Sensitive personal data should only be accessible where justified and authorized.

Platform administration should not imply unrestricted viewing of private data without safeguards.

4.3 Application health and diagnostics
Include monitoring for:

Server errors.
Failed background jobs.
Application exceptions.
API response times.
Database health.
Storage usage.
Import failures.
Tournament processing errors.
Unusual system activity.
Include searchable diagnostic logs where practical.

4.4 Usage analytics
Track useful product analytics, including:

Most-used application features.
Number of tournaments created over time.
Group-stage versus knockout tournament usage.
PDF draw import success and failure rates.
Referee activity.
Match scoring activity.
User retention and engagement.
Application performance trends.
Analytics should be designed with data minimization and privacy considerations.

4.5 Developer tools
Provide controlled functionality for:

Viewing application version information.
Inspecting feature flags.
Managing platform configuration.
Reviewing system-generated logs.
Exporting diagnostic reports.
Monitoring database migrations.
Reviewing failed operations.
Investigating reported bugs.
Potentially destructive administrative actions must require confirmation and generate audit records.

Do not expose raw database credentials, authentication secrets, API keys, or unrestricted server execution through the admin panel.

4.6 Administrator protection
The developer administrator role must be separate from organizer and referee roles.

Administrative permissions must be enforced server-side.

Do not allow ordinary users to promote themselves into administrators.

Use secure administrator provisioning, strong authentication, and additional verification for sensitive operations.

A complete security architecture will be specified separately.

Feature 5: Tournament Data Preservation and Manual Recovery
This requirement applies to all tournament formats.

Organizers must have a reliable way to recover information if something goes wrong.

Required functionality
Provide an export system containing:

Tournament configuration.
Registered players and their identifiers.
Seeding information.
Group assignments.
Group standings.
Knockout brackets.
Match schedules.
Match results.
Game-by-game scores.
Point-by-point event history where recorded.
Faults, lets, and scoring corrections.
Referee assignments.
Qualification and progression history.
Authorized manual overrides.
Relevant timestamps and audit records.
Support machine-readable exports such as JSON and CSV, as well as human-readable reports.

Provide a complete tournament export option that can be used for recovery or external processing.

Maintain an append-only audit trail for important changes, including who made each change and when.

Where possible, implement backups and safe restoration mechanisms.

The organizer must never be trapped in an irreversible tournament state merely because an automatic progression rule has been triggered.

Feature 6: Future Web Deployment Preparation
The application is currently being developed as a functional tournament management system.

Web deployment is a later development phase.

For now, prioritize implementing and testing core tournament functionality while designing the architecture to support future web deployment.

When the website is prepared for public release, additional requirements will include:

Secure authentication and session management.
Authorization and role-based access control.
HTTPS.
Appropriate cookie and session handling.
Privacy policy.
Terms of service.
Data retention and deletion policies.
User consent mechanisms where legally required.
Account recovery.
Database security.
Rate limiting and abuse prevention.
Security monitoring.
Appropriate legal and regulatory compliance.
Mobile-responsive interfaces.
Accessibility.
Production deployment and monitoring.
Do not postpone essential security protections for accounts, permissions, or sensitive data until after deployment. These must be implemented and tested before the corresponding features are made publicly accessible.

Implementation Instructions for Codex
Inspect the current repository and identify the existing player, match, game, tournament, scoring, and persistence architecture.
Explain which existing components can be reused and which new components are required.
Propose a modular implementation plan with dependencies and priorities.
Preserve existing knockout tournament functionality and the PDF draw-import workflow.
Implement optional player attributes as a small, isolated change.
Develop group-stage tournament models, generation, scoring, standings, and progression before implementing the full interface.
Keep tournament logic independent of the GUI or future website framework.
Design organizer, referee, and developer roles with server-side authorization in mind.
Preserve backward compatibility and provide migrations where data models change.
Add automated tests for seeding, group generation, tie-breaking, qualification, referee permissions, score corrections, and data recovery.
Avoid unnecessary dependencies and major architectural rewrites.
Explain all proposed structural changes before implementing them.
Do not attempt to implement all these features in one enormous change. Divide the work into manageable, testable phases.

The immediate objective is a reliable, extensible tournament-management system. Public website deployment, detailed security hardening, legal documentation, and production infrastructure will be addressed in subsequent development phases, without compromising the safety of any features implemented earlier.
