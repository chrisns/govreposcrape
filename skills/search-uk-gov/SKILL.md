---
name: search-uk-gov
description: Search UK government code repositories for patterns, examples, and libraries
user_invocable: false
---

# UK Government Code Search

You have access to the `search_uk_gov_code` MCP tool which searches across 24,500+ UK government repositories indexed from GitHub. Use it when the user asks about UK government code, patterns, or implementations.

## When to use this tool

- User asks about UK government code patterns or implementations
- User wants to find examples from NHS, HMRC, DWP, GDS, MOJ, or other UK government departments
- User needs to discover how government services handle authentication, validation, APIs, etc.
- User is building something that should align with UK government standards (GOV.UK Design System, NHSX, etc.)

## Query guidance

**Good queries** are natural language with domain context:
- "NHS FHIR API patient data integration authentication"
- "HMRC tax calculation validation business rules"
- "GOV.UK Design System accessible form components"
- "DWP Universal Credit eligibility validation"
- "postcode validation regex patterns UK government"

**Poor queries** are too short or generic:
- "auth" (too vague)
- "api" (no context)
- "code" (meaningless)

## Parameters

- `query` (string, required): Natural language search query, 3-500 characters
- `limit` (number, optional): Results to return, 1-100, default 20

## Interpreting results

Each result includes:
- **Title**: Repository name
- **URL**: Direct GitHub link
- **Organization**: The government department (alphagov, nhsdigital, hmrc, dwp, etc.)
- **Repository**: Specific repo name

## Key UK government GitHub organizations

| Organization | Department |
|---|---|
| `alphagov` | Government Digital Service (GDS) |
| `nhsdigital` | NHS Digital |
| `hmrc` | HM Revenue & Customs |
| `dwp` | Department for Work and Pensions |
| `cabinetoffice` | Cabinet Office |
| `ministryofjustice` | Ministry of Justice |
| `defra` | Department for Environment, Food & Rural Affairs |
| `companieshouse` | Companies House |
| `UKHomeOffice` | Home Office |
