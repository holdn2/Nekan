/**
 * The history and trash tabs. They are the same list rendered twice — same
 * layout, same day grouping, different timestamp and different buttons — so
 * one component takes both and only the differences are passed in.
 *
 * Neither tab can edit anything. A row here is a record: it can be moved back
 * into play (되돌리기 / 복원) or thrown further away, and that is all.
 *
 * Each <section> stays in index.html and React fills it, because window/chrome
 * shows and hides those sections by class when the tab changes.
 */

import { createRoot } from "react-dom/client";
import { t } from "../i18n.js";
import {
  doneTasks,
  trashedTasks,
  restoreTask,
  deleteTask,
  untrashTask,
  purgeTask,
  trashAll,
  untrashAll,
  purgeAll,
} from "../store.js";
import { ArchiveTab } from "./archive/tab.js";

export { resetArchivePaging } from "./archive/paging.js";

function History() {
  return (
    <ArchiveTab
      which="history"
      all={doneTasks}
      stamp={(task) => task.completedAt}
      emptyKey="archive.historyEmpty"
      searchKey="history.search"
      actions={(task) => [
        { label: t("archive.restore"), onClick: () => restoreTask(task.id) },
        {
          label: t("archive.delete"),
          onClick: () => deleteTask(task.id),
          danger: true,
        },
      ]}
      bulk={[
        {
          labelKey: "history.clearAll",
          danger: true,
          confirm: (count) => t("archive.confirmTrashAll", { count }),
          run: trashAll,
        },
      ]}
    />
  );
}

function Trash() {
  return (
    <ArchiveTab
      which="trash"
      all={trashedTasks}
      stamp={(task) => task.deletedAt}
      emptyKey="archive.trashEmpty"
      searchKey="trash.search"
      actions={(task) => [
        { label: t("archive.untrash"), onClick: () => untrashTask(task.id) },
        {
          label: t("archive.purge"),
          onClick: () => purgeTask(task.id),
          danger: true,
        },
      ]}
      bulk={[
        // No question: restoring puts things back, which is the undo for the
        // one below rather than something to be careful about.
        { labelKey: "trash.restoreAll", run: untrashAll },
        {
          labelKey: "trash.empty",
          danger: true,
          confirm: (count) => t("archive.confirmPurgeAll", { count }),
          run: purgeAll,
        },
      ]}
    />
  );
}

/**
 * Fill the two sections index.html left empty. Called once, from init().
 *
 * Answers the roots it made. init() has no use for them -- they live as long as
 * the window does -- but the tests call this once per case, and a root nobody
 * can unmount goes on answering the render bus from a detached tree.
 */
export function mountArchive() {
  const roots = [];
  const history = document.getElementById("historyView");
  if (history) {
    const root = createRoot(history);
    root.render(<History />);
    roots.push(root);
  }
  const trash = document.getElementById("trashView");
  if (trash) {
    const root = createRoot(trash);
    root.render(<Trash />);
    roots.push(root);
  }
  return roots;
}
