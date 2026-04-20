import { Metadata } from 'next';
import { Radio } from 'lucide-react';

export const metadata: Metadata = { title: 'Live News' };

export default function LivePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse" />
        <Radio className="h-6 w-6 text-brand" />
        <h1 className="text-2xl font-bold text-gray-900">Live</h1>
      </div>

      <div className="bg-black rounded-2xl overflow-hidden aspect-video flex items-center justify-center">
        <div className="text-center text-white">
          <Radio className="h-16 w-16 mx-auto mb-4 text-gray-500" />
          <p className="text-gray-400">Live stream coming soon</p>
          <p className="text-sm text-gray-600 mt-2">Stay tuned for live coverage</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        {['Nation Reporters Live', 'Breaking News 24x7', 'Regional News'].map((ch) => (
          <div key={ch} className="border rounded-xl p-4 cursor-pointer hover:bg-gray-50 transition-colors">
            <div className="flex items-center gap-2 mb-2">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-medium text-red-600 uppercase tracking-wider">Live</span>
            </div>
            <h3 className="font-semibold text-gray-800">{ch}</h3>
          </div>
        ))}
      </div>
    </div>
  );
}
