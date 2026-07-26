# Skillbase

Skillbase is an in-company AI skills manager that helps teams discover, install, recommend, and measure reusable AI-agent skills across an organization.

As companies adopt AI agents such as Claude Code, Cursor, Codex, and internal automation tools, teams quickly accumulate prompts, workflows, MCP tools, and domain-specific agent capabilities. Skillbase gives companies a private system of record for those skills so employees can find the right workflow, install it quickly, and see which skills are actually useful.

## Problem

Companies are creating more internal AI-agent skills every day, but those skills are usually scattered across documents, Slack messages, repositories, and individual team workflows.

This creates several problems:

- Employees do not know which internal skills already exist.
- Teams duplicate similar workflows across departments.
- Managers cannot tell which skills are actually being used.
- Skill updates are hard to announce and distribute.
- New employees have no simple way to find skills for their role.
- Companies lack data on whether a skill improves productivity.

## Solution

Skillbase is a company-wide skills library and recommendation layer for AI-agent workflows.

Employees can describe what they need in natural language:

> I am a designer looking for a skill that makes designs cleaner and more polished.

Skillbase searches the company skill library, ranks the most relevant skills, and shows each skill with install data, adoption charts, expected impact, update history, and a one-click install action.

## Core Features

### Natural-Language Skill Search

Users can search by describing the outcome they want, not by remembering an exact skill name.

Example searches:

- Make this UI look cleaner.
- Find a skill for legal contract review.
- Recommend a sales email writing workflow.
- Which skills should a junior designer install first?

### One-Click Skill Installation

Users can install a recommended skill directly into their AI workflow.

```bash
npx skilldrop install <skill-name>
```

SkillDrop is the CLI install layer for Skillbase. After setup, it can sync local skills and send approved usage events back to the company library.

### Usage Analytics

Each skill can include analytics such as:

- Installs
- Active users
- Department adoption
- Usage frequency
- Retention after install
- Version usage
- Before and after productivity signals

This helps teams understand which internal AI workflows are spreading and which ones need improvement.

### Personalized Recommendations

Skillbase recommends skills based on role, department, seniority, existing workflows, and similar users.

Example recommendations:

- Designers in your team often use this visual polish skill.
- This skill is trending among product managers.
- People who switched from Skill A to Skill B completed tasks faster.
- A newer version of your installed skill is available.

### Skill Update Feed

When a team publishes or updates an internal skill, Skillbase can notify relevant users.

Example updates:

- The Design QA skill was updated yesterday.
- Your team created a new Figma-to-PRD skill.
- A recommended legal review workflow is now available for your department.

### Company Governance

Companies can control who can view, install, and manage each skill.

Possible access levels:

- Company-wide skills
- Department-only skills
- Manager-approved skills
- Experimental beta skills
- Admin-maintained official skills

## Hackathon Demo

The hackathon MVP focuses on three main screens:

1. **Ask / Search**
   A prompt box where users describe the skill they need.

2. **Skill Recommendations**
   Ranked skill cards with install buttons, short explanations, install counts, adoption metrics, and simple charts.

3. **Company Analytics Dashboard**
   A dashboard showing trending skills, department adoption, usage activity, and recommendation insights.

## MVP Scope

### User MVP

- Search for skills with natural language.
- Browse recommended skills.
- View skill detail pages.
- See adoption metrics and usage charts.
- Install a skill with one click.
- Receive basic role-based recommendations.

### Admin MVP

- Add and edit internal skills.
- Categorize skills by department and role.
- Mark skills as official, recommended, or experimental.
- Track installs and usage.
- View company-wide analytics.

### CLI / Agent Integration MVP

- `npx skilldrop install`
- Local skill registry sync
- Optional telemetry collection with company approval
- Basic event tracking for install, run, update, and uninstall events

## Example User Story

A designer joins a company and wants to improve UI quality with internal AI workflows.

They search:

> I want a skill that makes product designs look cleaner and more consistent.

Skillbase returns:

1. Design Polish Skill
2. Figma QA Reviewer
3. Visual Hierarchy Feedback Agent
4. Brand Consistency Checker

Each result shows usage rate, rating, install count, adoption chart, and estimated productivity impact. The designer clicks **Install**, and the skill becomes available in their AI-agent environment.

## Why Skillbase Is Different

Skillbase is not a public prompt marketplace. It is a private skill management and intelligence layer for companies using AI agents internally.

Skillbase focuses on:

- Internal workflows
- Company-specific best practices
- Skill adoption analytics
- Productivity impact measurement
- Role-based recommendations
- Permission and governance controls

## Positioning

> Skillbase helps companies manage, recommend, and measure internal AI-agent skills.

## Future Vision

The first version focuses on discovery, installation, analytics, and recommendations for skills that already exist or are manually added by teams.

Over time, Skillbase can become the intelligence layer for how companies operate with AI agents: tracking what workflows people use, recommending better automations, and helping teams continuously improve their internal AI capabilities.
