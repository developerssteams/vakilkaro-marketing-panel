"use client";

/* ============================================================
   components/Pager.js — har table ke liye ek hi pagination

   const { rows, offset, pager } = usePaged(list);
   …table me `rows` dikhao, neeche {pager}
   10 se zyada rows hon tabhi pager dikhta hai. List chhoti-badi ho
   (filter / search badla) to apne aap page 1 pe aa jaata hai.
   ============================================================ */

import { useEffect, useState } from "react";

export const PAGE_SIZE = 10;

export function usePaged(list, resetKey = "") {
  const all = Array.isArray(list) ? list : [];
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [all.length, resetKey]);
  const cur = Math.min(page, pages);
  const offset = (cur - 1) * PAGE_SIZE;
  return {
    rows: all.slice(offset, offset + PAGE_SIZE),
    offset,
    page: cur,
    pages,
    pager: <TablePager page={cur} pages={pages} total={all.length} onPage={setPage} />,
  };
}

export function TablePager({ page, pages, total, onPage, perPage = PAGE_SIZE }) {
  if (pages <= 1) return null;
  const nums = [];
  for (let n = 1; n <= pages; n += 1) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 1) nums.push(n);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return (
    <nav className="pgr" aria-label="Pages">
      <span className="pgr-info">Showing <b>{(page - 1) * perPage + 1}–{Math.min(page * perPage, total)}</b> of <b>{total}</b></span>
      <div className="pgr-btns">
        <button type="button" className="pgr-btn" disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><i className="fa-solid fa-chevron-left" /><span>Prev</span></button>
        {nums.map((n, i) => (n === "…"
          ? <span key={`d${i}`} className="pgr-dots">…</span>
          : <button type="button" key={n} className={`pgr-num${n === page ? " on" : ""}`} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>{n}</button>))}
        <button type="button" className="pgr-btn" disabled={page === pages} onClick={() => onPage(page + 1)} aria-label="Next page"><span>Next</span><i className="fa-solid fa-chevron-right" /></button>
      </div>
    </nav>
  );
}
