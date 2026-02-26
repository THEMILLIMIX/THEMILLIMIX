import React from 'react';
import { PortfolioItem } from '../types';

interface PortfolioProps {
  items: PortfolioItem[];
  isAdmin: boolean;
  onDeleteItem: (id: string) => void;
}

export const Portfolio: React.FC<PortfolioProps> = ({ items, isAdmin, onDeleteItem }) => {
  return (
    <div className="text-white p-4 md:p-8">
      <h2 className="text-3xl font-bold mb-6 text-center">Portfolio</h2>
      <div className="max-w-4xl mx-auto">
        <div className="border border-white/20 rounded-xl overflow-hidden">
          <div className="grid grid-cols-4 md:grid-cols-5 bg-white/10 p-4 font-bold">
            <div>Artist</div>
            <div>Title</div>
            <div>Role</div>
            <div className="text-right">Year</div>
            {isAdmin && <div className="text-right">Actions</div>}
          </div>
          {items.length === 0 ? (
            <div className="p-4 text-center text-white/50">포트폴리오가 없습니다.</div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="grid grid-cols-4 md:grid-cols-5 p-4 border-t border-white/10 items-center">
                <div>{item.artist}</div>
                <div>{item.title}</div>
                <div>{item.role}</div>
                <div className="text-right">{item.year}</div>
                {isAdmin && (
                  <div className="text-right">
                    <button 
                      onClick={() => onDeleteItem(item.id)}
                      className="text-red-500 hover:text-red-400"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
