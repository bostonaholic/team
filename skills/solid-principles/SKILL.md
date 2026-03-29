---
name: solid-principles
description: SOLID object-oriented design principles methodology — loaded by implementer agent when writing code and by code-reviewer agent when checking for design violations
---

# SOLID Principles

SOLID is a set of five design principles that reduce coupling, increase
cohesion, and make software easier to maintain and extend. Apply them when
writing new code and check for violations when reviewing code.

## S — Single Responsibility Principle (SRP)

**A module, class, or function should have one reason to change.**

A "reason to change" means one actor or stakeholder whose requirements could
change the code. Code with multiple responsibilities becomes a tangled web
where changing one concern breaks another.

### Code smells indicating SRP violation

- A class or function with more than one clear purpose (e.g., `UserService`
  that validates input, persists to the database, AND sends emails)
- Functions longer than ~30 lines — length often signals multiple concerns
- `and` in a function name: `validateAndSave()`, `parseAndFormatDate()`
- Multiple, unrelated tests for a single unit

### Applying SRP

- Separate concerns into distinct modules: parsing, validation, persistence,
  notification each belong in separate classes or functions
- A function should do one thing and name that thing clearly
- If you cannot name a function without using "and", it has too many jobs

## O — Open/Closed Principle (OCP)

**Software entities should be open for extension but closed for modification.**

Adding new behavior should not require changing existing, tested code.
Achieve this through abstraction: program to interfaces, not implementations.

### Code smells indicating OCP violation

- A long `if/else` or `switch` on a type field that must be modified every
  time a new type is added
- Hardcoded lists of variants: `if type === 'admin' ... else if type === 'user'`
- Tests that break whenever a new variant is added to an existing structure

### Applying OCP

- Define interfaces or abstract base types for behavior that varies
- Add new behavior by adding new implementations, not modifying existing ones
- Use strategy pattern, plugin pattern, or polymorphism to swap behavior

## L — Liskov Substitution Principle (LSP)

**Subtypes must be substitutable for their base types without altering program
correctness.**

If code works correctly with a `Shape`, it must work correctly with a
`Rectangle` that extends `Shape`, without the caller knowing which it got.

### Code smells indicating LSP violation

- Overriding a method to throw `NotImplementedError` or do nothing
- Callers checking `instanceof` before calling methods: `if (x instanceof Square)`
- Subclasses that weaken preconditions or strengthen postconditions beyond
  what the base type promises
- Tests that cannot be run on both the base type and the subtype

### Applying LSP

- Design inheritance hierarchies based on behavior, not taxonomy
- Prefer composition over inheritance when the "is-a" relationship does not
  hold behaviorally
- A subclass may restrict behavior (e.g., `ReadOnlyList` cannot mutate) but
  must fulfill all contracts the base type advertises

## I — Interface Segregation Principle (ISP)

**Clients should not be forced to depend on interfaces they do not use.**

Fat interfaces force clients to implement or depend on methods they do not
need, creating unnecessary coupling.

### Code smells indicating ISP violation

- Interface with 10+ methods implemented by multiple classes, each of which
  uses only 3 of them
- Classes that implement an interface by throwing `UnsupportedOperationException`
  for several methods
- Test doubles that must stub many irrelevant methods to satisfy an interface

### Applying ISP

- Split large interfaces into smaller, focused ones
- A client should only know about the methods it actually calls
- Compose multiple small interfaces when a concrete type needs to satisfy
  several contracts

## D — Dependency Inversion Principle (DIP)

**High-level modules should not depend on low-level modules. Both should
depend on abstractions. Abstractions should not depend on details.**

Business logic should not import database drivers, HTTP clients, or file
system APIs directly. It should depend on interfaces that those details
implement.

### Code smells indicating DIP violation

- Business logic classes that instantiate their own dependencies with `new`
- `import DatabaseClient from './database'` inside a domain service
- Tests that cannot run without real databases, network calls, or file system
  access
- Difficult to test without mocking entire subsystems

### Applying DIP

- Inject dependencies through constructors or function parameters
- Define interfaces in the domain layer; implement them in the infrastructure
  layer
- Pass in collaborators as arguments rather than instantiating them inside
  the function

## Applying SOLID in the Implementer Role

When writing new code:

1. **Before writing:** Ask "what is this unit's single responsibility?" If the
   answer contains "and", split it.
2. **When adding behavior:** Ask "can I add this without modifying existing
   tested code?" Use abstractions where extension is expected.
3. **When using inheritance:** Verify that subtypes honor the base type's
   contracts. Prefer composition when uncertain.
4. **When defining interfaces:** Define only what callers need. Split when
   multiple distinct clients use the same interface differently.
5. **When using dependencies:** Inject them. Do not instantiate infrastructure
   inside domain logic.

## Applying SOLID in the Reviewer Role

When reviewing code for SOLID violations:

- Flag SRP violations by name: `issue: SRP violation — this function handles
  both input validation and database write.`
- Flag OCP violations when new behavior requires modifying an existing
  `switch` or `if/else` chain.
- Flag LSP violations when subtypes override methods to throw or do nothing.
- Flag ISP violations when interfaces force clients to depend on methods they
  do not use.
- Flag DIP violations when business logic instantiates its own dependencies.

Every SOLID finding should cite the specific file and line, name the
principle, and explain the consequence: why does this violation matter for
this codebase right now?
