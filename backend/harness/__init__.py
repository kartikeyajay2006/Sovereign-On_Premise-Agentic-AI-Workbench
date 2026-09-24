"""Harnesses: governed, reusable, multi-run workflows.

A harness runs a whole job -- twenty questions across the SOP corpus, every
section of a department's procedures -- by composing ORDINARY tasks. Each
child is created through the task service, so it is classified, checked
against policy, grounded in retrieval, verified, held for approval where the
rules say so, and audited, exactly like a request typed into the thread. The
harness adds sequencing, aggregation and a hashed report on top; it never
calls the orchestrator and has no path around any gate.

Modules:

* ``definitions`` -- the YAML contract under ``config/harnesses/``.
* ``expansion``   -- inputs into child prompts.
* ``corpus``      -- the indexed sections a person may actually retrieve.
* ``aggregate``   -- child records into outcomes, derived and never asserted.
* ``report``      -- the markdown/JSON deliverable.
* ``store``       -- persistence beside the tasks table.
* ``service``     -- the runner, cancellation, approval and audit.
"""
