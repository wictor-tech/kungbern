# VERAPEP v12.4 validation

- 20/20 Node regression tests passed.
- Static validation passed: 8 HTML templates, 84 products, 170 variants.
- Custom vial validation passed: 84/84 catalogue products render their exact database `product.name`, a variant strength and a valid goal-based colour group.
- Seven primary vial colour groups are active: weight & metabolism, skin appearance, strength & recovery, energy & vitality, sleep & focus, healthy ageing, hormonal & specialist.
- Browser E2E could not run in the build environment because localhost navigation is blocked by administrator policy; this is an environment limitation rather than an application test failure.
- `server.mjs`, `database.mjs` and `data/verapep.sqlite` checksums match v12.3 exactly.
