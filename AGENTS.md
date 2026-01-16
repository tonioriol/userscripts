# Agent Guidelines

## Git Commit Messages

Always use conventional commits format for commit messages:

- Single line format: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- Example: `fix(gometric): respect browser locale for decimal separator`

## Development Workflow

For each fix, feature, or chore, follow this cycle:

### 1. Implement → Test → Fix → Test (until green)

- Write tests first when possible (TDD)
- Run tests after each change
- Fix failures immediately
- Repeat until all tests pass

### 2. Architecture First

- Think long-term maintainability over quick fixes
- Design clean, well-tested, elegant yet simple solutions
- Avoid accumulating technical debt
- Consider extensibility and edge cases

### 3. Simplify (final step)

After functionality is complete and tests pass, review and refine:

**Preserve Functionality:** Never change what the code does - only how it does it.

**Enhance Clarity:**

- Reduce unnecessary complexity and nesting
- Eliminate redundant code and abstractions
- Improve readability through clear variable and function names
- Consolidate related logic
- Avoid nested ternaries - prefer match expressions or if/else chains
- Choose clarity over brevity - explicit code is often better than compact code

**Maintain Balance:** Avoid over-simplification that could:

- Reduce code clarity or maintainability
- Create overly clever solutions that are hard to understand
- Remove helpful abstractions that improve organization
- Prioritize "fewer lines" over readability
- Make the code harder to debug or extend

### 4. Version & Commit

- Bump version following semver (patch for fixes, minor for features)
- Commit with conventional commit message
