# Markeringar ur skärmbilderna

Räknar fram var de orangea markeringarna (①②③ + ruta) sitter i varje skärmbild, och vilket steg som
pekar på vilken markering. Resultatet hamnar i `content/hotspots.sv.json` och används för de inzoomade
bilderna i stegen. Positionerna kan sedan finjusteras i admin ("Rita").

Kör igen när skärmbilderna i `public/screens/` byts ut:

```bash
pip install numpy scipy pillow
python3 scripts/hotspots/classify.py public/screens /tmp/hs/digits.json      # läser siffrorna
python3 scripts/hotspots/assign.py public/screens content/guides.sv.json /tmp/hs/hotspots.json /tmp/hs/verify
# Titta på bilderna i /tmp/hs/verify – blå ruta + siffra ska sitta på rätt knapp.
python3 scripts/hotspots/steps.py /tmp/hs/hotspots.json content/guides.sv.json content/hotspots.sv.json public/screens
```

`classify.py` varnar när siffrorna i en bild inte blir exakt 1…N. `assign.py` läser `digits.json` från samma
mapp som sin utfil. Mallarna för siffrorna 1–7 pekar ut kända brickor i bild 01 och 06.
