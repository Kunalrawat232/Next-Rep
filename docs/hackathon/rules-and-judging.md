# Hackathon: rules and judging

**Build With AI Hackathon 2026** (internal company hackathon).

- **Challenge:** build ONE working product/MVP in one month, using AI as a development partner. The product does not have to be an AI product; what is judged is how well AI is used across the development lifecycle.
- **Individual entry.** Substantial implementation must be the entrant's (with AI assistance), not other people's.
- **Deadline:** 30 October 2026, end of day. **No changes after submission.**
- **Internal feature freeze:** 25 October 2026. The plan and dates are single-sourced in the [roadmap](../plans/roadmap.md).

## Judging weights

| Weight | Category                     | What judges look for                                                                                                                                  |
| ------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 35%    | AI development practices     | AI across the lifecycle, context engineering, AI-assisted development and QA, agents/skills/instructions, human validation, learning from AI failures |
| 30%    | Engineering and code quality | Architecture, maintainability, testing, security, reliability, deployment, documentation, technical trade-offs                                        |
| 25%    | Product quality              | Core functionality, UX, completeness of chosen scope, polish, usefulness                                                                              |
| 10%    | Idea / business potential    | Smaller weight on purpose                                                                                                                             |

## Hard rules from the organisers

- Never hardcode secrets. No passwords, API keys or tokens anywhere in the repo or its **Git history** (the full Git history is submitted as a ZIP).
- Use appropriate environment/configuration handling.
- Implement authentication and authorisation where applicable.
- Validate inputs. Protect data and APIs. Handle user data responsibly.
- Consider dependency risks and AI-related risks.
- AI-assisted QA is **required** (test generation, edge cases, negative testing, debugging, code review). Full E2E automation is not required, but we must explain how AI contributed to QA and how its output was validated.
- No customer or client confidential information, data, code or IP. Use only invented sample data.
- Respect third-party licences and terms.
- Disclose any significant pre-existing work (there is none).

## Submission must contain

- Product description, problem statement, working demo link
- ZIP with the complete project and full Git history
- Technical docs: architecture, tech stack, technical decisions, limitations, dependencies
- AI development docs: how AI was used, workflow, context engineering, skills, agents, instructions, guardrails
- QA docs: AI-assisted testing and QA approach
- Demo video, maximum 5 minutes

**Implication:** documentation, decision records, tests and the AI log are first-class deliverables, not afterthoughts.
