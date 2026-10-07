import { describe, expect, it } from "vitest";
import { publishedSeedGuides } from "@/lib/seed";
import { buildIndex, judge, search } from "@/lib/search";
import { terms } from "@/lib/text";
import { EVAL_CASES } from "../scripts/eval-cases";

const index = buildIndex(publishedSeedGuides());
const top = (q: string, page?: string) => {
  const { hits } = search(index, q, { page });
  return { id: hits[0]?.guide.id ?? null, ...judge(hits) };
};

describe("textbehandling", () => {
  it("normaliserar böjningar och synonymer till samma term", () => {
    expect(terms("bilder")).toEqual(terms("bild"));
    expect(terms("foto")).toEqual(terms("bild"));
    expect(terms("chauffören")).toEqual(terms("förare"));
    expect(terms("port")).toEqual(terms("lastbrygga"));
  });
  it("förstår frasverb även med frågeordföljd", () => {
    expect(terms("checkar jag ut")).toEqual(["checkout"]);
    expect(terms("hur loggar jag ut")).toEqual(["utloggning"]);
    expect(terms("hur loggar jag in")).toEqual(terms("inloggning"));
    expect(terms("kan inte boka")).toEqual(["bokningsproblem"]);
  });
  it("blandar inte ihop användare och används", () => {
    expect(terms("användare")).not.toEqual(terms("används"));
  });
});

describe("sökning", () => {
  it("hittar briefens exempel", () => {
    expect(top("Hur lägger jag upp en bild?")).toMatchObject({ id: "lagga-upp-en-bild", verdict: "answered" });
    expect(top("Ändra slideshow").id).toBe("andra-bildspelet");
    expect(top("Ny bild på skärmen").id).toBe("lagga-upp-en-bild");
    expect(top("Hur skapar jag en bokning?").id).toBe("skapa-en-bokning");
  });
  it("hittar både svenska och engelska knappnamn", () => {
    expect(top("spara kapacitet").id).toBe("andra-kapacitet-per-timme");
    expect(top("save capacity").id).toBe("andra-kapacitet-per-timme");
    expect(top("bildhantering").id).toBe("lagga-upp-en-bild");
    expect(top("image management").id).toBe("lagga-upp-en-bild");
    expect(top("ej tilldelad").id).toBe("byta-lastbrygga");
  });
  it("tål stavfel", () => {
    expect(top("bildpsel").id).toBe("andra-bildspelet");
    expect(top("kappacitet").id).toBe("andra-kapacitet-per-timme");
  });
  it("svarar ärligt när guide saknas", () => {
    expect(top("Hur lägger jag till en användare?").id).toBe("lagga-till-en-anvandare");
    expect(top("koppla vår kamera").verdict).not.toBe("answered");
    expect(top("vad kostar lup").verdict).toBe("none");
  });
  it("använder sidkontext för 'detta' men låter tydliga frågor vinna", () => {
    expect(top("Hur ändrar jag detta?", "capacity-timeslots")).toMatchObject({ id: "andra-kapacitet-per-timme", verdict: "answered" });
    expect(top("vad gör den här sidan", "site-board").id).toBe("kalla-in-en-forare");
    expect(top("ingen kan boka", "site-board")).toMatchObject({ id: "andra-kapacitet-per-timme", verdict: "answered" });
  });
  it("ger aldrig ett säkert svar med fel guide i testsviten", () => {
    for (const c of EVAL_CASES) {
      const r = top(c.q, c.page);
      if (r.verdict !== "answered") continue;
      const ok = c.expect === null ? [] : Array.isArray(c.expect) ? c.expect : [c.expect];
      expect(ok, `"${c.q}" gav ${r.id}`).toContain(r.id);
    }
  });
});
