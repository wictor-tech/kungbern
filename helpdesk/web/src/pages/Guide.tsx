import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Candidate, LocalizedGuide } from "../../../shared/types";
import { api, type GuideListItem } from "../api";
import { useHelp } from "../context";
import { CandidateList, GuideView } from "../components/GuideView";

export function GuidePage() {
  const { id = "" } = useParams();
  const { lang, t, page, sessionId } = useHelp();
  const [data, setData] = useState<{ guide: LocalizedGuide; related: Candidate[] } | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    setData(null); setError(false);
    api.guide(id, lang).then((d) => { setData(d); api.event({ type: "view", guideId: id, page, sessionId, lang }); }).catch(() => setError(true));
  }, [id, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  if (error) return <div className="card"><p className="error">{t.loadError}</p><Link to="/">{t.home}</Link></div>;
  if (!data) return <div className="skeleton"><div className="sk sk-title" /><div className="sk sk-img" /></div>;
  return <GuideView guide={data.guide} related={data.related} />;
}

export function TopicPage() {
  const { id = "" } = useParams();
  const { lang, t, catLabel, catIcon } = useHelp();
  const [list, setList] = useState<GuideListItem[] | null>(null);
  useEffect(() => { setList(null); api.guides(lang, { category: id }).then(setList).catch(() => setList([])); }, [id, lang]);
  return (
    <div>
      <h1>{catIcon(id)} {catLabel(id)}</h1>
      {list && !list.length && <p className="muted">{t.noGuides}</p>}
      {list && <CandidateList items={list.map((g) => ({ guideId: g.id, title: g.title, summary: g.summary, category: g.category, score: 1 }))} />}
    </div>
  );
}
