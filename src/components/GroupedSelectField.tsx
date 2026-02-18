"use client";

interface SiteGroup {
    group: string;
    sites: string[];
}

interface GroupedSelectFieldProps {
    label: string;
    value: string;
    groups: SiteGroup[];
    placeholder: string;
    onChange: (value: string) => void;
    icon: React.ReactNode;
}

export default function GroupedSelectField({
    label,
    value,
    groups,
    placeholder,
    onChange,
    icon,
}: GroupedSelectFieldProps) {
    return (
        <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-300 uppercase tracking-wider">
                {icon}
                {label}
            </label>
            <div className="relative">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={`
            w-full appearance-none rounded-2xl border-2 px-5 py-4
            text-lg font-medium transition-all duration-200
            focus:outline-none focus:ring-4
            ${value
                            ? "border-sky-500/50 bg-sky-500/10 text-white focus:ring-sky-500/20"
                            : "border-slate-600/50 bg-slate-800/50 text-slate-400 focus:border-sky-500/50 focus:ring-sky-500/20"
                        }
          `}
                >
                    <option value="" disabled className="bg-slate-800 text-slate-400">
                        {placeholder}
                    </option>
                    {groups.map((g) => (
                        <optgroup key={g.group} label={`【${g.group}】`} className="bg-slate-800 text-slate-300">
                            {g.sites.map((site) => (
                                <option
                                    key={`${g.group}-${site}`}
                                    value={`${g.group} - ${site}`}
                                    className="bg-slate-800 text-white"
                                >
                                    {g.group} - {site}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                {/* カスタム矢印アイコン */}
                <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                            clipRule="evenodd"
                        />
                    </svg>
                </div>
            </div>
        </div>
    );
}
