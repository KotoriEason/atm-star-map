import React from 'react';
import ReactDOM from 'react-dom/client';
import {App} from './App';
import '@xyflow/react/dist/style.css';
import './styles.css';
import {loadDataset} from './data';
const root=document.getElementById('root')!;
void loadDataset().then(()=>ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>)).catch(error=>{root.textContent=error instanceof Error?error.message:'配方数据加载失败，请刷新页面重试。';});
