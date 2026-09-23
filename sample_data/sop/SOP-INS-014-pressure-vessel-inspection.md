# SOP-INS-014 — Pressure Vessel External and Internal Inspection

> **SYNTHETIC DOCUMENT** — fictional procedure written for the AEGIS demonstration corpus. It is not a real site procedure and must not be used for real equipment.

**Document:** SOP-INS-014
**Revision:** 4.3
**Status:** SYNTHETIC
**Department:** Inspection & Integrity
**Classification:** Confidential — Internal Use Only
**Effective date:** 01 September 2026
**Supersedes:** SOP-INS-014 Rev 4.2
**Related:** SOP-INS-017, SOP-INS-021, SOP-INS-025, SOP-INS-030, SOP-MNT-022, SOP-OPS-008
**Revision note:** Rev 4.3 restates Clauses 2 and 5 from tables into numbered sub-clauses, so each service category and each severity can be cited on its own; states the formulas and year rounding in Clauses 3.1, 4.1 and 4.2; adds cross-references in 2.5, 4.6 and 6.4. No threshold, interval, required action or approval authority changed from Rev 4.2.

---

## 1. Purpose and Scope

This procedure governs the periodic external and internal inspection of
pressure vessels operating within the refinery battery limits, including
separators, knock-out drums, surge vessels and accumulators registered under
the Static and Mobile Pressure Vessels (Unfired) Rules.

This procedure applies to all vessels with a design pressure exceeding
1.0 bar(g) and an internal volume exceeding 500 litres. Process piping is
covered by SOP-INS-017.

## 2. Inspection Intervals

Each vessel is assigned one service category on its equipment record, and
that category sets the maximum intervals in Clauses 2.1 to 2.4. Where a
vessel fits more than one category, the shortest applicable interval applies.

### 2.1 Non-Corrosive, Non-Lethal Service

A pressure vessel in non-corrosive, non-lethal service shall receive an
external inspection at intervals not exceeding 24 months, an internal
inspection at intervals not exceeding 72 months, and a thickness survey at
intervals not exceeding 48 months.

### 2.2 Corrosive Service

A pressure vessel in corrosive service shall receive an external inspection
at intervals not exceeding 12 months, an internal inspection at intervals not
exceeding 48 months, and a thickness survey at intervals not exceeding
24 months.

### 2.3 Lethal or Toxic Service

A pressure vessel in lethal or toxic service shall receive an external
inspection at intervals not exceeding 12 months, an internal inspection at
intervals not exceeding 36 months, and a thickness survey at intervals not
exceeding 24 months.

### 2.4 Steam and Hot Condensate Service

A pressure vessel in steam and hot condensate service shall receive an
external inspection at intervals not exceeding 18 months, an internal
inspection at intervals not exceeding 60 months, and a thickness survey at
intervals not exceeding 36 months.

### 2.5 Extension of Intervals

Intervals shall not be extended beyond the values in Clauses 2.1 to 2.4
without a documented Fitness-For-Service assessment under SOP-INS-021,
approved by the Head of Inspection. A risk-based inspection plan under
SOP-INS-030 may shorten an interval but does not by itself authorise an
extension.

## 3. Minimum Allowable Thickness

### 3.1 Calculated Minimum Thickness

The minimum allowable thickness (t-min) for any shell or head course shall be
calculated per ASME Section VIII Division 1 in the corroded condition, using
the vessel's registered design pressure. For a cylindrical shell (UG-27):

    t_min = (P × R) / (S × E − 0.6 × P)

P is the design pressure (MPa), R the inside radius (mm), S the allowable
stress at design temperature (MPa) and E the joint efficiency. Formed heads
use the corresponding UG-32 formula.

### 3.2 Structural Minimum for Carbon Steel

Where the calculated t-min is less than 6.0 mm for a carbon steel shell
course, 6.0 mm shall be adopted as the structural minimum irrespective of the
pressure calculation. Example: P = 1.05 MPa, R = 600 mm, S = 138 MPa and
E = 1.0 give t_min = 630 / 137.37 = 4.59 mm, so 6.0 mm is adopted.

### 3.3 Withdrawal Below t-min

A vessel shall be withdrawn from service immediately when any measured
thickness reading falls below t-min, or when the projected thickness at the
next scheduled inspection falls below t-min.

## 4. Corrosion Rate and Remaining Life

### 4.1 Short-Term Corrosion Rate

The short-term corrosion rate at each measurement location shall be
calculated as:

    short_term_rate (mm/year) = (t_previous − t_current) / years_between_inspections

Years are calculated from the dates and rounded to one decimal place.

### 4.2 Long-Term Corrosion Rate

The long-term corrosion rate shall be calculated from the original nominal
thickness and the date the vessel entered service:

    long_term_rate (mm/year) = (t_nominal − t_current) / years_in_service

Years are calculated from the dates and rounded to one decimal place.

### 4.3 Governing Corrosion Rate

The governing corrosion rate at a location is the **higher** of the
short-term and long-term rates. The governing location of a vessel is the
location with the lowest remaining life, which is not necessarily the
thinnest reading or the fastest rate.

### 4.4 Remaining Life

Remaining life at each location shall be calculated as:

    remaining_life (years) = (t_current − t_min) / governing_corrosion_rate

### 4.5 Remaining Life Below 4 Years

Where remaining life is less than 4 years, the vessel shall be placed on the
accelerated monitoring register and the inspection interval halved.

### 4.6 Remaining Life Below 2 Years

Where remaining life is less than 2 years, a repair, re-rating or replacement
plan shall be raised before the next operating campaign, and a
Fitness-For-Service assessment is required under SOP-INS-021 Clause 2.2.

## 5. Findings Classification

Every finding shall be assigned exactly one severity — High, Medium or Low —
as defined in Clauses 5.1 to 5.3. Where a finding meets the definition of more
than one severity, the higher severity applies.

### 5.1 High Severity

A finding is High severity where any of the following applies: an immediate
threat to containment; thickness below t-min; a through-wall defect; a failed
relief device.
Required action for a High finding: withdraw from service within 24 hours.
Approval authority for a High finding: Head of Inspection + Plant Manager.

### 5.2 Medium Severity

A finding is Medium severity where any of the following applies: remaining
life below 4 years; active external corrosion; coating breakdown over 20% of
the surface; insulation damage permitting corrosion under insulation (CUI).
Required action for a Medium finding: repair within the current shutdown
window.
Approval authority for a Medium finding: Head of Inspection.

### 5.3 Low Severity

A finding is Low severity where any of the following applies: cosmetic
corrosion; minor coating defects; labelling and access deficiencies.
Required action for a Low finding: rectify within 6 months.
Approval authority for a Low finding: Inspection Engineer.

## 6. Approval Note Requirements

### 6.1 When an Approval Note Is Required

Every inspection resulting in a Medium or High severity finding shall be
accompanied by an approval note recommending the disposition of the vessel.

### 6.2 Approval Note Content

The approval note shall state, as a minimum:

- Vessel tag number and service description
- Date of inspection and inspection method employed
- Measured thickness readings against t-min
- Calculated corrosion rate and remaining life, showing the inputs used
- Severity classification per Clause 5
- Recommended disposition and the date by which it must be executed
- The clause of this SOP relied upon for each recommendation

### 6.3 Countersignature

An approval note is not valid until countersigned by the approving authority
named in Clause 5 for the highest severity finding recorded: Clause 5.1 for a
High finding, Clause 5.2 for a Medium finding.

### 6.4 Continued Service with a Medium Finding

Any recommendation that a vessel continue in service (continued operation)
with a Medium finding shall record the compensating measures applied; its
approving authority is the Head of Inspection (Clause 5.2). Operation of equipment awaiting a
Fitness-For-Service assessment is interim operation under SOP-INS-021
Clause 6, with the approvals in SOP-OPS-008 Clause 2.8.

## 7. Records

All inspection records, thickness data sets, photographs and approval notes
shall be retained on the organisation's internal document management system
for the operating life of the vessel plus seven years. Records shall not be
transmitted outside the organisation's controlled network.
