/**
 * The history tab. The list itself is components/archive-list.tsx, shared
 * with the trash tab.
 */
import { ArchiveList } from "../../components/archive-list";

export default function HistoryScreen() {
  return <ArchiveList tab="history" />;
}
