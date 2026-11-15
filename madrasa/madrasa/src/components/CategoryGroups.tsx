'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import type { CategoryView } from '@/lib/catalog';
import { Check, ChevronDown, ChevronUp } from './icons';

interface Props {
  groups: [string, CategoryView[]][];
  disabled?: boolean;
  onStart: (v: CategoryView) => void;
}

/** Main categories as an accordion; all collapsed by default to keep the screen calm. */
export function CategoryGroups({ groups, disabled, onStart }: Props) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (g: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(g)) next.add(g);
      return next;
    });

  return (
    <div className="accordion">
      {groups.map(([group, list], gi) => {
        const isOpen = open.has(group);
        const total = list.reduce((n, v) => n + v.wordIds.length, 0);
        const learned = list.reduce((n, v) => n + v.learned, 0);
        const panelId = `group-panel-${gi}`;
        return (
          <section key={group} className="acc-item" data-testid="category-group">
            <button
              className="acc-head"
              onClick={() => toggle(group)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              data-testid="group-toggle"
            >
              <span className="acc-title">{group}</span>
              <span className="acc-meta muted">
                {learned}/{total} נלמדו · {list.length} תתי-קטגוריות
              </span>
              {isOpen ? <ChevronUp /> : <ChevronDown />}
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={panelId}
                  key="panel"
                  className="acc-panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                >
                  <div className="grid acc-grid">
                    {list.map((v) => {
                      const title = v.name.includes(':') ? v.name.split(':').slice(1).join(':').trim() : v.name;
                      const pct = v.wordIds.length ? (v.learned / v.wordIds.length) * 100 : 0;
                      return (
                        <button key={v.id} className="card cat" onClick={() => onStart(v)} disabled={disabled} data-testid="category-card">
                          <div className="cat-title">{title}</div>
                          <div className="muted small">
                            {v.learned > 0 && <Check />} {v.learned}/{v.wordIds.length} נלמדו
                          </div>
                          <div className="bar">
                            <div className="bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        );
      })}
    </div>
  );
}
