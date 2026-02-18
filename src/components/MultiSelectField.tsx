"use client";

import { useState } from "react";

interface MultiSelectFieldProps {
    label: string;
    options: string[];
    selectedValues: string[];
    onChange: (values: string[]) => void;
    icon: React.ReactNode;
}

export default function MultiSelectField({
    label,
    options,
    selectedValues,
    onChange,
    icon,
}: MultiSelectFieldProps) {
    const [isOpen, setIsOpen] = useState(false);

    const toggleOption = (option: string) => {
        if (selectedValues.includes(option)) {
            onChange(selectedValues.filter((v) => v !== option));
        } else {
            onChange([...selectedValues, option]);
        }
    };

    const toggleAll = () => {
        if (selectedValues.length === options.length) {
            onChange([]);
        } else {
            onChange([...options]);
        }
    };

    return (
        <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-300 uppercase tracking-wider">
                {icon}
                {label}
                {selectedValues.length > 0 && (
                    <span className="ml-auto rounded-full bg-sky-500/20 px-2.5 py-0.5 text-xs font-bold text-sky-400 normal-case">
                        {selectedValues.length}名選択中
                    </span>
                )}
            </label>

            {/* トグルボタン */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`
          w-full rounded-2xl border-2 px-5 py-4 text-left text-lg font-medium
          transition-all duration-200 focus:outline-none focus:ring-4
          ${selectedValues.length > 0
                        ? "border-sky-500/50 bg-sky-500/10 text-white focus:ring-sky-500/20"
                        : "border-slate-600/50 bg-slate-800/50 text-slate-400 focus:border-sky-500/50 focus:ring-sky-500/20"
                    }
        `}
            >
                <div className="flex items-center justify-between">
                    <span>
                        {selectedValues.length === 0
                            ? "作業者を選択してください"
                            : selectedValues.join("、")}
                    </span>
                    <svg
                        className={`h-5 w-5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2}
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                </div>
            </button>

            {/* チェックボックスリスト */}
            {isOpen && (
                <div className="rounded-2xl border-2 border-slate-600/50 bg-slate-800/80 overflow-hidden">
                    {/* 全選択/解除 */}
                    <button
                        type="button"
                        onClick={toggleAll}
                        className="w-full border-b border-slate-700/50 px-5 py-3 text-left text-sm font-semibold text-sky-400 hover:bg-slate-700/30 transition-colors"
                    >
                        {selectedValues.length === options.length ? "✓ 全解除" : "□ 全選択"}
                    </button>

                    {options.map((option) => {
                        const isSelected = selectedValues.includes(option);
                        return (
                            <button
                                key={option}
                                type="button"
                                onClick={() => toggleOption(option)}
                                className={`
                  flex w-full items-center gap-3 px-5 py-3.5 text-left text-base
                  transition-colors
                  ${isSelected ? "bg-sky-500/10 text-white" : "text-slate-300 hover:bg-slate-700/30"}
                `}
                            >
                                {/* チェックボックス */}
                                <div
                                    className={`
                    flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg border-2
                    transition-all duration-200
                    ${isSelected
                                            ? "border-sky-500 bg-sky-500 text-white"
                                            : "border-slate-500 bg-transparent"
                                        }
                  `}
                                >
                                    {isSelected && (
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                        </svg>
                                    )}
                                </div>
                                <span className="font-medium">{option}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
