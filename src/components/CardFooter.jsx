import { MdSave } from 'react-icons/md';

function CardFooter({ onBack, onClear, onSave, isLoading, error }) {
    return (
        <div className="rounded-b-xl border-t border-slate-200 bg-[rgba(61,83,159,0.05)]">
            {error && (
                <p className="text-red-500 text-xs text-right px-6 pt-3">{error}</p>
            )}
            <div className="flex justify-between items-center px-6 py-4">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-5 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                    Back to Quality Control
                </button>

                <div className="flex items-center gap-4">
                    <button
                        onClick={onClear}
                        className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                    >
                        Clear Form
                    </button>
                    <button
                        onClick={onSave}
                        disabled={isLoading}
                        className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#3d539f] text-white text-sm font-bold disabled:opacity-60 hover:bg-[#2f4180] transition-colors"
                    >
                        <MdSave size={17} />
                        {isLoading ? 'Saving...' : 'Save Record'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default CardFooter;
