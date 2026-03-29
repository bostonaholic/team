---
name: refactoring-to-patterns
description: Fowler's refactoring methodology — loaded by the implementer agent when working with existing code to recognize code smells and apply proven transformations
---

# Refactoring to Patterns

Refactoring is the process of changing the internal structure of code without
changing its observable behavior. Every refactoring step must leave all tests
passing. Never refactor while also adding features — separate the two activities.

## When to Refactor

Refactor when you need to:

- **Make a change easier before making it.** If the code is hard to change,
  refactor first, then change. Two small moves beat one large dangerous move.
- **Remove duplication discovered during implementation.** The Rule of Three:
  tolerate duplicate code the second time, refactor the third time.
- **Improve clarity before debugging.** Code you cannot understand, you cannot
  fix reliably. Clarify first, then fix.

Do NOT refactor when:

- The tests are failing. Fix failing tests first.
- The code is working well and no change is imminent. Refactoring for its own
  sake is waste.
- You are under a deadline to deliver a feature. Note the smell for later;
  do not block the feature.

## Code Smells and Their Refactorings

### Long Method

**Smell:** A function that is too long to understand in one reading (~30+ lines
is a guideline, not a rule — some 10-line functions are too long).

**Refactorings:**
- **Extract Method** — Pull a cohesive block of code into its own named
  function. The new name documents intent.
- **Replace Temp with Query** — Extract a temporary variable's computation
  into a method so the name explains what is computed.
- **Decompose Conditional** — Extract complex condition predicates and their
  branches into named methods.

### Duplicate Code

**Smell:** The same structure appears in two or more places. The danger: a
bug in the pattern must be fixed in every copy.

**Refactorings:**
- **Extract Method** — Pull the duplicate logic into a shared function.
- **Extract Class** — If duplicates appear across classes, extract the
  shared behavior into a new class both can use.
- **Pull Up Method** — Move a method common to several subclasses into the
  base class.
- **Form Template Method** — If two methods perform similar steps in similar
  order, extract the skeleton into a template method and override the
  varying parts.

### Large Class

**Smell:** A class has too many responsibilities, indicated by many instance
variables, many methods, or methods that use only a subset of variables.

**Refactorings:**
- **Extract Class** — Identify a cohesive subset of fields and methods;
  move them to a new class and compose.
- **Extract Subclass** — If the class behaves differently under certain
  conditions, extract a subclass for each behavioral variant.
- **Extract Interface** — Define an interface for the subset of methods
  that callers actually need.

### Long Parameter List

**Smell:** A function with four or more parameters is hard to call correctly
and hard to remember.

**Refactorings:**
- **Introduce Parameter Object** — Replace a cluster of parameters that
  always travel together with a single object.
- **Preserve Whole Object** — Pass the object itself instead of extracting
  multiple values from it before calling.
- **Replace Parameter with Method** — If one parameter can be derived by
  calling a method on another, remove it and call the method inside.

### Divergent Change

**Smell:** A single class changes for multiple different reasons — every
time X happens you change one set of methods, every time Y happens you
change a different set. This is SRP violation made visible.

**Refactorings:**
- **Extract Class** — Split the class along the lines of each reason to
  change.

### Shotgun Surgery

**Smell:** One logical change requires small edits to many different classes.
The opposite of Divergent Change: behavior that should be together is spread
apart.

**Refactorings:**
- **Move Method / Move Field** — Pull scattered pieces toward a cohesive
  home.
- **Inline Class** — If two small classes are always changed together, merge
  them.

### Feature Envy

**Smell:** A method that seems more interested in another class's data than
its own — it uses getters to pull out data and compute something.

**Refactorings:**
- **Move Method** — Move the envious method to the class it envies. The
  data and the behavior belong together.
- **Extract Method** — If only part of the method has feature envy, extract
  that part and move it.

### Primitive Obsession

**Smell:** Using primitives (strings, integers, booleans) to represent
domain concepts — phone numbers as strings, money as floats, status as
magic string constants.

**Refactorings:**
- **Replace Data Value with Object** — Create a class for the concept so it
  carries validation, formatting, and behavior.
- **Replace Type Code with Class** — Replace magic constants with a type
  that the compiler can check.
- **Replace Type Code with Subclasses** — When behavior varies by type,
  use polymorphism instead of a type field.

### Conditional Complexity

**Smell:** Complex chains of `if/else` or `switch` that must be updated every
time a new variant is added. Frequently accompanies Primitive Obsession.

**Refactorings:**
- **Replace Conditional with Polymorphism** — Each branch becomes an
  override in a subclass or strategy.
- **Introduce Null Object** — Replace checks for null with a null object
  that does nothing (or the right default thing).
- **Decompose Conditional** — Extract the condition and its branches into
  named methods so the intent is readable.

### Middle Man

**Smell:** A class that delegates most of its methods to another class. If
half or more of a class's public methods just forward to another class,
the middle man adds no value.

**Refactorings:**
- **Remove Middle Man** — Let callers call the delegated class directly.
- **Inline Method** — If a method just calls another, inline the delegation.

## Safe Refactoring Procedure

Every refactoring step must follow this sequence:

1. **Ensure tests pass** before starting. If tests fail, stop — do not
   refactor broken code.
2. **Make the smallest possible structural change.** One refactoring at a
   time.
3. **Run tests after each change.** If tests break, undo the change
   immediately. Do not proceed with broken tests.
4. **Commit when tests pass.** Each passing checkpoint is a safe point.
5. **Repeat** until the code is in the desired shape.

## Applying This in the Implementer Role

When working with existing code during implementation:

1. **Read the code before changing it.** Identify smells before writing.
2. **Separate refactoring from feature work.** If a refactoring is needed
   to make the feature easier to add, do the refactoring in its own commit
   first, then add the feature.
3. **Refactor only what you touch.** Do not opportunistically refactor
   distant code unrelated to the current task — that is scope creep.
4. **Name the smell and the refactoring in the commit.** "refactor: extract
   user validation into UserValidator (Long Method)" tells reviewers exactly
   what happened and why.
5. **When in doubt, leave it.** An imperfect but working refactoring that
   breaks tests is worse than the smell it was trying to fix. Only refactor
   when you are confident the transformation is safe.
