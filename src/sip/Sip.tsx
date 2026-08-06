// Máquina de estados do SIP: bloqueado (login) → desktop com módulo aberto.
import { useState } from "react";
import type { LoadedContent } from "../engine/types";
import { isUnlocked, setUnlocked } from "../engine/storage";
import { LoginScreen } from "./LoginScreen";
import { Desktop } from "./Desktop";

export function Sip({ content }: { content: LoadedContent }) {
  const casoId = content.system.casoId;
  const [unlocked, setUnlockedState] = useState(() => isUnlocked(casoId));
  const [openModuleId, setOpenModuleId] = useState<string | null>(null);

  const handleUnlock = () => {
    setUnlocked(casoId, true);
    setUnlockedState(true);
  };

  const handleLogout = () => {
    setUnlocked(casoId, false);
    setOpenModuleId(null);
    setUnlockedState(false);
  };

  if (!unlocked) {
    return <LoginScreen system={content.system} onUnlock={handleUnlock} />;
  }
  return (
    <Desktop
      content={content}
      openModuleId={openModuleId}
      onOpenModule={setOpenModuleId}
      onLogout={handleLogout}
    />
  );
}
