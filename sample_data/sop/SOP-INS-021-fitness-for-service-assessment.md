# SOP-INS-021 — Fitness-For-Service Assessment of Pressure Equipment

> **SYNTHETIC DOCUMENT** — fictional procedure written for the AEGIS demonstration corpus. It is not a real site procedure and must not be used for real equipment.

**Document:** SOP-INS-021
**Revision:** 3.1
**Status:** SYNTHETIC
**Department:** Inspection & Integrity
**Classification:** Confidential — Internal Use Only
**Effective date:** 01 January 2026
**Supersedes:** SOP-INS-021 Rev 3.0
**Related:** SOP-ENG-009, SOP-INS-014, SOP-INS-017, SOP-INS-025, SOP-MNT-022, SOP-OPS-008
**Revision note:** Rev 3.1 numbers the triggers in Clause 2 as 2.1 to 2.6; restates the local metal loss trigger (2.3) as 25% of nominal thickness, for pressure vessels only, with piping referred under SOP-INS-017; adds the interval extension trigger (2.6) and change control (5.4); restates the assessment levels from a table into Clauses 3.1 to 3.3.

---

## 1. Purpose

To define when a Fitness-For-Service (FFS) assessment is required, which level
of assessment applies, and what must be recorded before equipment showing
degradation is returned to service.

## 2. When an Assessment Is Required

An FFS assessment shall be raised when any one of the triggers in Clauses 2.1
to 2.6 applies. Piping circuits are referred for assessment under
SOP-INS-017 Clause 7.3.

### 2.1 Thickness Below t-min

An FFS assessment shall be raised when measured wall thickness is below t-min
but no through-wall defect exists. The equipment is withdrawn from service
under SOP-INS-014 Clause 3.3 while the assessment is made.

### 2.2 Remaining Life Below 2 Years

An FFS assessment shall be raised when remaining life calculated per
SOP-INS-014 Clause 4 is less than 2 years.

### 2.3 Local Metal Loss in a Pressure Vessel

An FFS assessment shall be raised when local metal loss in a pressure vessel
exceeds 25% of nominal wall thickness, measured as nominal thickness minus the
minimum thickness recorded in the affected area. For a 12.0 mm nominal shell,
the trigger is a minimum reading below 9.0 mm.

### 2.4 Crack-Like Flaws

An FFS assessment shall be raised when a crack-like flaw of any length is
detected in a pressure boundary, whatever its depth or orientation.

### 2.5 Service Beyond Design Life

An FFS assessment shall be raised when equipment is proposed for continued
service beyond its registered design life.

### 2.6 Interval Extension

An FFS assessment shall be raised when an inspection interval is proposed for
extension beyond SOP-INS-014 Clauses 2.1 to 2.4. It shall show that the
equipment remains above t-min to the end of the extended interval.

## 3. Assessment Levels

Each assessment is made at the lowest level able to reach a conclusion, as set
in Clauses 3.1 to 3.3. A Level 1 assessment that fails shall be escalated to
Level 2 rather than being used as a basis for rejection.

### 3.1 Level 1 Assessment

A Level 1 assessment applies to uniform metal loss where geometry is within
code limits and there are no crack-like flaws. It may be performed by an
Inspection Engineer. Typical duration: 1 to 2 days.

### 3.2 Level 2 Assessment

A Level 2 assessment applies to local metal loss, pitting or blisters that
require detailed stress analysis. It is performed by a Senior Integrity
Engineer. Typical duration: 1 to 2 weeks. Pitting beneath insulation is first
measured under SOP-MNT-022 Clause 4.2.

### 3.3 Level 3 Assessment

A Level 3 assessment applies to crack-like flaws, creep damage, or cases that
need numerical stress analysis. It is performed by an approved third-party
specialist under the Head of Inspection. Typical duration: 3 to 6 weeks.

## 4. Remaining Strength Factor

### 4.1 Calculating the Remaining Strength Factor

The Remaining Strength Factor (RSF) shall be calculated for all local metal
loss assessments. RSF is the load capacity of the damaged component divided
by the load capacity of the undamaged component.

### 4.2 RSF Acceptance Criterion

The acceptance criterion is **RSF ≥ 0.90**. Equipment with an RSF below 0.90
shall not return to service without a re-rating or a repair.

### 4.3 RSF Between 0.90 and 0.95

Where RSF falls between 0.90 and 0.95, the inspection interval shall be halved
and the location placed on the accelerated monitoring register.

## 5. Re-Rating

### 5.1 Re-Rated MAWP

Where the assessment shows the equipment cannot sustain its registered design
pressure, a re-rated Maximum Allowable Working Pressure (MAWP) may be
established:

    MAWP_rerated = MAWP_original × RSF

Example: MAWP_original = 10.5 bar(g) and RSF = 0.86 give
MAWP_rerated = 10.5 × 0.86 = 9.03 bar(g).

### 5.2 Approval of a Re-Rating

A re-rating requires the written approval of the Head of Inspection and the
Plant Manager (SOP-OPS-008 Clause 2.6), and the equipment nameplate shall be
updated within 30 days.

### 5.3 Reassessment of Re-Rated Equipment

Re-rated equipment shall be re-assessed at every subsequent inspection,
without exception, and its relief devices reset under SOP-INS-025 Clause 4.2.

### 5.4 Change Control for a Re-Rating

A re-rating changes the design conditions of the equipment and shall be
processed as a change under SOP-ENG-009 before the re-rated MAWP takes effect.

## 6. Interim Operation

### 6.1 Conditions for Interim Operation

Interim operation is operation of equipment that is awaiting an assessment
under this procedure. It is permitted only where all of the following hold:

- No through-wall defect and no active leak
- Measured thickness is at or above t-min at every location
- Operating pressure is reduced to 90% of the registered MAWP or lower
- The equipment is inspected at not more than 30-day intervals
- The arrangement is recorded in an approval note and countersigned

### 6.2 Duration and Approval of Interim Operation

Interim operation shall not exceed 180 days from the date of the finding. It
is recommended by the Inspection Engineer and approved by both the Head of
Inspection and the Plant Manager (SOP-OPS-008 Clause 2.8).

## 7. Records

Every assessment shall record the calculation inputs, the method applied, the
RSF obtained, the disposition, and the identity of the assessor and approver.
Assessment records are retained for the operating life of the equipment plus
ten years and shall not leave the organisation's controlled network.
