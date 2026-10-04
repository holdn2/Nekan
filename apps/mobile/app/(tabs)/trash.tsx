/**
 * The trash tab. The list itself is components/archive-list.tsx, shared
 * with the history tab.
 */
import { ArchiveList } from "../../components/archive-list";

export default function TrashScreen() {
  return <ArchiveList tab="trash" />;
}
