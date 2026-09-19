import { useCallback, useState } from "react";
import { NetworkMap, type FocusTarget } from "../components/NetworkMap";
import { LineCard } from "../components/LineCard";
import { StopCard } from "../components/StopCard";
import { SearchPanel } from "../components/SearchPanel";
import { getLine, stopByIndex } from "../lib/network";

/** /transit — the whole-network explorer (map, search, line/stage cards). */
export function TransitHome() {
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [selectedStopIdx, setSelectedStopIdx] = useState<number | null>(null);
  const [focus, setFocus] = useState<FocusTarget | null>(null);

  const handleSelectLine = useCallback((id: string | null) => {
    setSelectedLineId(id);
    setSelectedStopIdx(null);
  }, []);

  const handleSelectStop = useCallback((idx: number | null) => {
    setSelectedStopIdx(idx);
    if (idx !== null) setSelectedLineId(null);
  }, []);

  const handleSearchLine = useCallback((id: string) => {
    setSelectedStopIdx(null);
    setSelectedLineId(id);
    setFocus({ seq: Date.now(), kind: "line", idOrIdx: id });
  }, []);

  const handleSearchStop = useCallback((idx: number) => {
    setSelectedLineId(null);
    setSelectedStopIdx(idx);
    setFocus({ seq: Date.now(), kind: "stop", idOrIdx: idx });
  }, []);

  const selectedLine = selectedLineId ? getLine(selectedLineId) : null;
  const selectedStop = selectedStopIdx !== null ? stopByIndex(selectedStopIdx) : null;

  return (
    <>
      <NetworkMap
        selectedLineId={selectedLineId}
        focus={focus}
        onSelectLine={handleSelectLine}
        onSelectStop={handleSelectStop}
      />

      <SearchPanel onPickLine={handleSearchLine} onPickStop={handleSearchStop} />

      {selectedLine && (
        <LineCard line={selectedLine} onClose={() => handleSelectLine(null)} />
      )}
      {selectedStop && (
        <StopCard
          stop={selectedStop}
          onPickLine={(id) => handleSelectLine(id)}
          onClose={() => handleSelectStop(null)}
        />
      )}
    </>
  );
}
