import React from 'react';
import { Title } from '@/components/common/Title';

const DataCenter: React.FC = () => {
  return (
    <div className="flex flex-col w-full h-full p-6">
      <Title title="数据中心" description="查看并分析您的直播间核心数据" />
      <div className="flex-1 w-full h-full mt-4 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-center h-full text-gray-400">
          数据大屏即将上线...
        </div>
      </div>
    </div>
  );
};

export default DataCenter;