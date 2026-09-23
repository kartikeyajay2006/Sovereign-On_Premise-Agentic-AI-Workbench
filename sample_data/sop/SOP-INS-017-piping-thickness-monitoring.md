# SOP-INS-017 — Piping Thickness Monitoring, Corrosion Rate and Remaining Life

> **SYNTHETIC DOCUMENT** — fictional procedure written for the AEGIS demonstration corpus. It is not a real site procedure and must not be used for real equipment.

**Document:** SOP-INS-017
**Revision:** 2.0
**Status:** SYNTHETIC
**Department:** Inspection & Integrity
**Classification:** Confidential — Internal Use Only
**Effective date:** 01 June 2025
**Supersedes:** SOP-INS-017 Rev 1.3
**Related:** SOP-INS-014, SOP-INS-021, SOP-INS-030, SOP-MNT-022, SOP-OPS-008, INV-2015-014

---

## 1. Purpose and Scope

This procedure sets how wall thickness is monitored on process piping within
the refinery battery limits, how corrosion rate and remaining life are
calculated at each condition monitoring location (CML), and when the next
thickness measurement is due. Pressure vessels are covered by SOP-INS-014.

## 2. Definitions

A circuit is a length of piping of one material and service, expected to
degrade in the same way along its length. A CML is a marked location on a
circuit where thickness is measured by ultrasonic testing (UT) at every
survey. t-min is the minimum allowable thickness of a CML under Clause 4.

## 3. Circuit Classes

### 3.1 Class 1 Circuits

Class 1 covers every injection point circuit, and circuits in flammable
service where a leak would vaporise and could cause an immediate emergency.
The maximum thickness measurement interval for a Class 1 circuit is 5 years.

### 3.2 Class 2 Circuits

Class 2 covers all process piping not assigned to Class 1 or Class 3. The
maximum thickness measurement interval for a Class 2 circuit is 10 years.

### 3.3 Class 3 Circuits

Class 3 covers circuits in non-flammable, non-toxic service, such as cooling
water and instrument air. The maximum thickness measurement interval for a
Class 3 circuit is 10 years.

### 3.4 Injection Points

An injection point circuit runs from 300 mm upstream of the injection point to
the second change in flow direction downstream of it, or 7.5 m downstream,
whichever is shorter. At least one CML shall be placed on the first fitting
downstream of the injection point. Introduced after investigation INV-2015-014.

## 4. Minimum Allowable Thickness

### 4.1 Pressure Design Thickness

The pressure design thickness of straight pipe shall be calculated as:

    t_p = (P × D) / (2 × (S × E × W + P × Y))

P is the design pressure (MPa), D the outside diameter (mm), S the allowable
stress (MPa), E the longitudinal joint quality factor, W the weld joint
strength reduction factor and Y a coefficient, 0.4 for ferritic steel below
482 °C.

### 4.2 Governing t-min

The t-min of a CML is the greater of the pressure design thickness from
Clause 4.1 and the structural minimum thickness from Clause 4.3.

### 4.3 Structural Minimum Thickness

The structural minimum thickness of carbon steel process piping from NPS 6 to
NPS 12 inclusive is 2.8 mm. Example: NPS 8 pipe (D = 219.1 mm) at
P = 0.35 MPa with S = 138 MPa, E = 1.0, W = 1.0 and Y = 0.4 gives
t_p = 76.685 / 276.28 = 0.28 mm, so t-min is the structural 2.8 mm.

### 4.4 Other Nominal Sizes

The structural minimum thickness for nominal sizes outside NPS 6 to NPS 12,
and for alloy piping, is set by the piping class sheet for the line. This
procedure does not state those values.

## 5. Corrosion Rate and Remaining Life

### 5.1 Corrosion Rates at a CML

At each CML the short-term and long-term corrosion rates shall be calculated
as follows, with years taken from the dates and rounded to one decimal place:

    short_term_rate (mm/year) = (t_previous − t_current) / years_between_surveys
    long_term_rate (mm/year) = (t_nominal − t_current) / years_in_service

The governing corrosion rate is the higher of the two.

### 5.2 Remaining Life of a CML

Remaining life at each CML shall be calculated as:

    remaining_life (years) = (t_current − t_min) / governing_corrosion_rate

The governing CML of a circuit is the CML with the lowest remaining life.

### 5.3 Worked Example: Corrosion Rate and Remaining Life

t_nominal = 8.18 mm, t_previous = 7.0 mm, t_current = 6.2 mm, 4.0 years
between surveys, 8.0 years in service, t_min = 2.8 mm. Short-term rate =
0.8 / 4.0 = 0.20 mm/year. Long-term rate = 1.98 / 8.0 = 0.2475 mm/year, which
is higher and governs. Remaining life = 3.4 / 0.2475 = 13.7 years.

## 6. Next Thickness Measurement

### 6.1 Measurement Interval

The next thickness measurement of a circuit is due at the survey date plus
the lesser of one half of the governing CML's remaining life and the maximum
interval for the circuit class in Clause 3. The interval is expressed in
whole months, rounded down.

### 6.2 Worked Example: Next Measurement

Remaining life 13.7 years on a Class 2 circuit: one half is 6.85 years
(82 months) and the Class 2 maximum is 10 years (120 months), so the next
measurement is due 82 months after the survey date.

### 6.3 Surveys and Deferral

Thickness surveys under this procedure may be performed on-stream. A survey
shall not be deferred beyond its due date without the approval required by
SOP-OPS-008 Clause 2.7.

## 7. Findings and Referral

### 7.1 Severity of Piping Findings

Findings on piping circuits shall be classified High, Medium or Low using the
definitions in SOP-INS-014 Clauses 5.1 to 5.3, and carry the required action
and approval authority stated there.

### 7.2 Remaining Life Below 4 Years

Where the remaining life of any CML is less than 4 years, the circuit shall be
placed on the accelerated monitoring register and its measurement interval
halved.

### 7.3 Referral for Fitness-For-Service

A circuit shall be referred for assessment under SOP-INS-021 where a CML
reading is below t-min without leakage, the remaining life of any CML is less
than 2 years, or a crack-like flaw is found. The local metal loss trigger in
SOP-INS-021 Clause 2.3 applies to pressure vessels only.

### 7.4 Insulated Piping

Insulated piping in the susceptibility range of SOP-MNT-022 Clause 2 shall
also be managed for corrosion under insulation under SOP-MNT-022. UT readings
taken through insulation windows are recorded against the CML as usual.

## 8. Records

CML locations, readings, calculations and the next due date shall be recorded
against the circuit number in the inspection database. Records are retained
for the life of the circuit plus seven years and shall not leave the
organisation's controlled network.
