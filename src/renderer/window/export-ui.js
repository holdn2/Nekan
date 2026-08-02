/**
 * The 내보내기 button.
 *
 * There is nothing to collect here: the document is built in the main process
 * from the task list that was last saved, and every renderer change goes
 * through the store's save. So this file is the click, the disabled flag that
 * keeps a second dialog from opening, and the toast that says where the file
 * went — the format itself is decided by the extension in the native dialog.
 */

import { $ } from '../dom.js';
import { toast } from '../components/toast.js';

/** Run one export round trip. Safe to call from the button or Ctrl+E. */
export async function exportBoard() {
  const btn = $('#exportBtn');
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const res = await window.api.exportBoard();
    if (res?.ok) {
      toast(`저장했습니다 · ${res.name}`, {
        action: {
          label: '폴더 열기',
          onClick: () => window.api.revealExport(res.path),
        },
      });
    } else if (res?.reason === 'empty') {
      toast('내보낼 항목이 없습니다.');
    } else if (res?.reason === 'error') {
      toast(`저장하지 못했습니다: ${res.message}`, { error: true, ms: 6000 });
    }
    // 'canceled' is the user closing the dialog — no message for that.
  } finally {
    btn.disabled = false;
  }
}
