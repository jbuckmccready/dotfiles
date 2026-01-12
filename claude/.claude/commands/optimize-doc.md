---
description: Optimize documentation for conciseness and clarity
disable-model-invocation: true
---

# Optimize Documentation Command

**Task**: Optimize the documentation file: $ARGUMENTS

## Objective

Make documentation more concise and clearer without introducing vagueness or misinterpretation.

**Optimization Goals** (in priority order):

1. **Eliminate vagueness**: Strengthen instructions with explicit criteria and measurable steps
2. **Increase conciseness**: Remove redundancy while preserving all necessary information
3. **Preserve clarity AND meaning**: Never sacrifice understanding or semantic accuracy for brevity

**Critical Constraint**: Instructions (text + examples) should only be updated if the new version retains BOTH the same meaning AND the same clarity as the old version. If optimization reduces clarity or changes meaning, reject the change.

**Idempotent Design**: This command can be run multiple times on the same document:

- **First pass**: Strengthens vague instructions, removes obvious redundancy
- **Second pass**: Further conciseness improvements if instructions are now self-sufficient
- **Subsequent passes**: No changes if already optimized

## Analysis Methodology

For each instruction section in the document:

### Step 1: Evaluate for Vagueness/Ambiguity

**Is the instruction clear WITHOUT the examples?**

- Cover the examples and read only the instruction
- Can it be executed correctly without looking at examples?
- Does it contain subjective terms like "clearly", "properly", "immediately" without definition?
- Are there measurable criteria or explicit steps?

**Decision Tree**:

```
Can instruction be followed correctly without examples?
├─ YES → Instruction is CLEAR → Proceed to Step 2
└─ NO → Instruction is VAGUE → Proceed to Step 3
```

### Step 2: If Clear (Examples Not Needed for Understanding)

**Only proceed here if instruction is unambiguous without examples.**

1. Identify examples following the instruction
2. **Apply Execution Test**: Can Claude execute correctly without this example?
   - If NO (example defines ambiguous term) → **KEEP**
   - If YES → Proceed to step 3
3. Determine if examples serve operational purpose:
   - ✅ Defines what "correct" looks like → **KEEP**
   - ✅ Shows exact commands with success criteria → **KEEP**
   - ✅ Sequential workflows where order matters → **KEEP**
   - ✅ Resolves ambiguity in instruction wording → **KEEP**
   - ✅ Data structures (JSON formats) → **KEEP**
   - ❌ Explains WHY (educational/rationale) → **REMOVE**
   - ❌ Only restates already-clear instruction → **REMOVE**

### Step 3: If Vague (Examples Needed for Understanding)

**DO NOT REMOVE EXAMPLES YET - Strengthen instruction first.**

1. Identify the source of vagueness:
   - Subjective terms without definition
   - Missing criteria or measurements
   - Unclear boundaries or edge cases
   - Narrative description instead of explicit steps

2. Strengthen the instruction:
   - Replace subjective terms with explicit criteria
   - Convert narrative to numbered steps
   - Add measurable thresholds or boundaries
   - Define what "success" looks like

3. **KEEP all examples** - They're needed until instruction is strengthened

4. **Mark for next pass**: After strengthening, examples can be re-evaluated in next optimization pass

## Categories of Examples to KEEP (Even with Clear Instructions)

1. **Executable Commands**: Bash scripts, jq commands, git workflows
2. **Data Structures**: JSON formats, configuration schemas, API contracts
3. **Boundary Demonstrations**: Prohibited vs permitted patterns, edge cases
4. **Concept Illustrations**: Examples that show what a vague term means (e.g., "contextual" JavaDoc)
5. **Templates**: Reusable formats for structured responses
6. **Prevention Examples**: Wrong vs right patterns for frequently violated rules
7. **Pattern Extraction Rules**: Annotations that generalize examples into reusable decision principles

## Categories of Examples to REMOVE

1. **Redundant Clarification**: Examples that restate the instruction in different words
2. **Obvious Applications**: Examples showing trivial applications of clear rules
3. **Duplicate Templates**: Multiple versions of the same template
4. **Verbose Walkthroughs**: Step-by-step narratives when numbered instructions exist

## 🚨 EXECUTION-CRITICAL CONTENT (NEVER CONDENSE)

The following content types are necessary for CORRECT EXECUTION - preserve even if instructions are technically clear:

### 1. **Concrete Examples Defining "Correct"**

- Examples showing EXACT correct vs incorrect patterns when instruction uses abstract terms
- Specific file paths, line numbers, or command outputs showing what success looks like
- **Test**: Does the example define something ambiguous in the instruction?

**KEEP when instruction says "delete" but example shows this means "remove entire entry, not mark complete"**:

```
bash
# ❌ WRONG: Marking complete in
todo.md
vim todo.md  # Changed - [ ] to - [x]
git commit -m "..." todo.md  # Result: Still in
todo.md

# ✅ CORRECT: Delete from
todo.md, add to changelog.md
vim todo.md  # DELETE entire task entry
vim changelog.md  # ADD under ## 2025-10-08
```

**REMOVE if instruction already says "remove entire entry" explicitly** - example becomes redundant.

### 2. **Sequential Steps for State Machines**

- Numbered workflows where order matters for correctness
- State transition sequences where skipping/reordering causes failures
- **Test**: Can steps be executed in different order and still work?

**KEEP numbered sequence** when order is mandatory:

```
1. Complete SYNTHESIS phase
2. Present plan to user
3. Update lock: `jq '.state = "SYNTHESIS_AWAITING_APPROVAL"'`
4. STOP - wait for user
5. On approval: Update lock to `CONTEXT` and proceed
```

**REMOVE numbering** if steps are independent checks that can run in any order.

### 3. **Inline Comments That Specify WHAT to Verify**

- Comments explaining what output to expect or check
- Annotations specifying exact conditions for success/failure
- **Test**: Does comment specify success criteria not in the instruction?

**KEEP comments specifying criteria**:

```
bash
# Before rewriting: git rev-list --count HEAD
# After rewriting: git rev-list --count HEAD
# Compare counts - should match unless you explicitly intended to drop commits
```

**REMOVE comments explaining WHY** (e.g., "This prevents data loss because..." is educational, not operational).

### 4. **Disambiguation Examples**

- Multiple examples showing boundary between prohibited/permitted when rule uses subjective terms
- Examples that resolve ambiguity in instruction wording
- **Test**: Can the instruction be misinterpreted without this example?

**KEEP examples that clarify ambiguous instructions**.
**REMOVE examples that just restate clear instructions**.

### 5. **Pattern Extraction Rules**

- Annotations that generalize specific examples into reusable decision principles
- Text that teaches how to apply the same reasoning to future cases
- **Test**: Does this text extract a general rule from a specific example?

**KEEP pattern extraction annotations**:

```
[Specific example code block]
→ Shows that "delete" means remove lines, not change checkbox.
```

The arrow extracts the general principle (what "delete" means) from the specific example.

**REMOVE pure commentary**:

```
[Example code block]
→ This is a good practice to follow.
```

Generic praise without extracting a reusable decision rule.

**Critical Distinction**:

- ✅ **KEEP**: "→ Specifies exactly what success looks like" (teaches pattern recognition)
- ❌ **REMOVE**: "This example helps you understand the concept" (generic educational)
- ✅ **KEEP**: "→ Claude doesn't need to know why" (generalizes when to remove content)
- ❌ **REMOVE**: "This is important because it prevents errors" (explains WHY, not WHAT)

**Test**: If removed, would Claude lose the ability to apply this reasoning to NEW examples not in the document? If YES → KEEP (it's pattern extraction, not commentary).

## 🚨 REFERENCE-BASED CONDENSING RULES

**When consolidating duplicate content via references:**

### ❌ NEVER Replace with References

1. **Content within sequential workflows** (Steps 1→2→3)
   - Jumping mid-workflow breaks execution flow
   - Keep operational content inline even if duplicated elsewhere

2. **Quick-reference lists in methodology sections**
   - Simple scannable lists serve different purpose than detailed explanations
   - Both can coexist: brief list for scanning, detailed section for depth

3. **Success criteria at decision points**
   - Content needed AT THE MOMENT of decision must be inline
   - Don't force jumping to verify each criterion

### ✅ OK to Replace with References

1. **Explanatory content that appears in multiple places**
   - Rationale sections
   - Background information
   - Historical context

2. **Content at document boundaries** (intro/conclusion)
   - References acceptable when introducing/summarizing
   - User not mid-execution at these points

3. **Cross-referencing related but distinct concepts**
   - "See also" style references
   - Not replacing direct duplication

### 🔍 Semantic Equivalence Test

**Before replacing content with reference, verify:**

1. **Same information**: Referenced section contains EXACT same information
   - ❌ WRONG: Replace "Goals: A, B, C" with reference to "Priority: C > B > A"
   - ✅ RIGHT: Replace duplicate "Goals: A, B, C" with reference to other "Goals: A, B, C"

2. **Same context**: Referenced section serves same purpose
   - ❌ WRONG: Replace "do X" with reference to "when to do X"
   - ✅ RIGHT: Replace "do X" with reference to "do X"

3. **Same level of detail**: No precision lost in referenced content
   - ❌ WRONG: Replace 7-item checklist with reference to 3-item summary
   - ✅ RIGHT: Replace 7-item checklist with reference to same 7-item checklist

### 📋 Duplication Taxonomy

**Type 1: Quick-Reference + Detailed** (KEEP BOTH)

- Simple list (3-5 words per item) for fast scanning
- Detailed section with tests, examples, edge cases
- **Purpose**: Different use cases - quick lookup vs deep understanding

**Type 2: Exact Duplication** (CONSOLIDATE)

- Same information, same level of detail, same context
- Appearing in multiple places with no contextual justification
- **Purpose**: Genuine redundancy - consolidate to single source

**Type 3: Pedagogical Repetition** (CONTEXT-DEPENDENT)

- Key rules stated multiple times for emphasis
- Summary + detailed explanation
- **Purpose**: Learning/retention - keep if document is pedagogical, remove if reference doc

### 🔍 Pre-Consolidation Verification

**Before removing ANY content for consolidation:**

1. ✅ Content is byte-for-byte duplicate OR semantically equivalent
2. ✅ Replacement reference doesn't interrupt sequential workflow
3. ✅ Referenced section is same level of detail
4. ✅ Consolidation doesn't remove quick-reference value
5. ✅ Verify by test: Can user execute task with reference-based version as easily as inline version?

**If ANY check fails → Keep duplicate inline**

## 🚨 DECISION RULE: The Execution Test

**Before removing ANY content, ask:**

1. **Can Claude execute the instruction CORRECTLY without this content?**
   - If NO → KEEP (execution-critical)
   - If YES → Proceed to question 2

2. **Does this content explain WHY (rationale/educational)?**
   - If YES → REMOVE (not needed for execution)
   - If NO → KEEP (operational detail)

3. **Does this content show WHAT "correct" looks like (success criteria)?**
   - If YES → KEEP (execution-critical)
   - If NO → Proceed to question 4

4. **Does this content extract a general decision rule from a specific example?**
   - If YES → KEEP (pattern extraction for future cases)
   - If NO → May remove if redundant

### Examples Applying the Test

**REMOVE THIS** (explains WHY):

```
**RATIONALE**: Git history rewriting can silently drop commits or changes,
especially during interactive rebases where "pick" lines might be accidentally
deleted or conflicts might be resolved incorrectly. Manual verification is the
only reliable way to ensure no data loss occurred.
```

→ Claude doesn't need to know why; just needs to know to verify.

**KEEP THIS** (defines WHAT "correct" means):

```
**ARCHIVAL SUCCESS CRITERIA**:
- `git diff todo.md` shows ONLY deletions
- `git diff changelog.md` shows ONLY additions under today's date
- Both files in SAME commit
- `grep task-name todo.md` returns no matches
```

→ Specifies exactly what success looks like; needed for correct execution.

**REMOVE THIS** (restates clear instruction):

```
When lock acquisition fails, you should not delete the lock file.
Instead, select an alternative task to work on.
```

→ If instruction already says "If lock acquisiti...
