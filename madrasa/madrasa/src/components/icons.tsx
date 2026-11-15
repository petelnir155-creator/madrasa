import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  ArrowLeft as _ArrowLeft,
  BookOpen as _BookOpen,
  Check as _Check,
  ChevronDown as _ChevronDown,
  ChevronUp as _ChevronUp,
  Clock as _Clock,
  Keyboard as _Keyboard,
  Languages as _Languages,
  LayoutGrid as _LayoutGrid,
  ListChecks as _ListChecks,
  LoaderCircle as _Loader2,
  Lock as _Lock,
  Play as _Play,
  Plus as _Plus,
  RotateCcw as _RotateCcw,
  Search as _Search,
  ShieldCheck as _ShieldCheck,
  Sparkles as _Sparkles,
  Trash2 as _Trash2,
  Trophy as _Trophy,
  LockOpen as _Unlock,
  X as _X,
} from 'lucide-react';

/** One stroke weight and default size for every icon in the app. */
export const ICON_STROKE = 1.75;

function wrap(Icon: LucideIcon): LucideIcon {
  const Wrapped = (props: LucideProps) => <Icon size={20} strokeWidth={ICON_STROKE} aria-hidden="true" {...props} />;
  return Wrapped as unknown as LucideIcon;
}

export const ArrowLeft = wrap(_ArrowLeft);
export const BookOpen = wrap(_BookOpen);
export const Check = wrap(_Check);
export const ChevronDown = wrap(_ChevronDown);
export const ChevronUp = wrap(_ChevronUp);
export const Clock = wrap(_Clock);
export const Keyboard = wrap(_Keyboard);
export const Languages = wrap(_Languages);
export const LayoutGrid = wrap(_LayoutGrid);
export const ListChecks = wrap(_ListChecks);
export const Loader = wrap(_Loader2);
export const Lock = wrap(_Lock);
export const Play = wrap(_Play);
export const Plus = wrap(_Plus);
export const RotateCcw = wrap(_RotateCcw);
export const Search = wrap(_Search);
export const ShieldCheck = wrap(_ShieldCheck);
export const Sparkles = wrap(_Sparkles);
export const Trash = wrap(_Trash2);
export const Trophy = wrap(_Trophy);
export const Unlock = wrap(_Unlock);
export const X = wrap(_X);
