import { useEffect, useState } from "react";
import { ContentProvider, loadContent } from "./engine/loadContent";
import type { LoadedContent } from "./engine/types";
import { Sip } from "./sip/Sip";

export default function App() {
  const [content, setContent] = useState<LoadedContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadContent()
      .then((c) => {
        if (alive) setContent(c);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error) return <p className="sip-page-error">Erro ao carregar conteúdo: {error}</p>;
  if (!content) return <p className="sip-page-loading">Carregando…</p>;
  return (
    <ContentProvider value={content}>
      <Sip content={content} />
    </ContentProvider>
  );
}
