import React, { useCallback, useEffect, useState } from 'react';
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = "0x17F825a57eB40bd8C192E38b61Cc242f48faE4E9";

const FUJI = {
  chainId: '0xa869',
  chainName: 'Avalanche Fuji C-Chain',
  nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
  rpcUrls: ['https://api.avax-test.network/ext/bc/C/rpc'],
};

const CONTRACT_ABI = [
  "function createTask(string _name, uint256 _deadline) payable",
  "function completeTask(uint256 _taskIndex)",
  "function punishTask(address _lazyUser, uint256 _taskIndex)",
  "function getTasks(address _user) view returns (tuple(string name, uint256 deadline, uint256 stakeAmount, bool isCompleted)[])",
];

const MIN_DEADLINE_SECONDS = 60; 

const shorten = (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
const errMsg = (e) => e?.reason || e?.shortMessage || e?.message || String(e);

function formatDuration(sec) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d} ngày ${h} giờ`;
  if (h > 0) return `${h} giờ ${m} phút`;
  if (m > 0) return `${m} phút`;
  return `${sec} giây`;
}

function statusOf(task, now) {
  if (task.isCompleted) return 'completed';
  if (task.stake === 0n) return 'slashed';
  if (now > task.deadline) return 'expired';
  return 'active';
}

const STATUS_LABEL = {
  active: 'Đang chạy',
  completed: 'Đã hoàn thành',
  expired: 'Quá hạn, chưa bị tịch thu',
  slashed: 'Đã bị tịch thu',
};

async function getContract() {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
}

async function ensureFuji() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: FUJI.chainId }],
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [FUJI] });
    } else {
      throw err;
    }
  }
}

function App() {
  const [account, setAccount] = useState("");
  const [viewAddress, setViewAddress] = useState("");
  const [lookupInput, setLookupInput] = useState("");
  const [tasks, setTasks] = useState([]);
  const [taskName, setTaskName] = useState("");
  const [deadlineDays, setDeadlineDays] = useState("");
  const [stakeAmount, setStakeAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); 
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [chainId, setChainId] = useState(""); 

  const contractReady = ethers.isAddress(CONTRACT_ADDRESS);
  const isOwn = account !== "" && viewAddress.toLowerCase() === account.toLowerCase();
  const onFuji = chainId.toLowerCase() === FUJI.chainId;

  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;

    window.ethereum.request({ method: 'eth_accounts' }).then((accs) => {
      if (accs[0]) {
        setAccount(accs[0]);
        setViewAddress(accs[0]);
      }
    }).catch(() => {});

    window.ethereum.request({ method: 'eth_chainId' }).then(setChainId).catch(() => {});

    const onAccountsChanged = (accs) => {
      setAccount(accs[0] || "");
      setViewAddress(accs[0] || "");
      setTasks([]);
    };
    const onChainChanged = (id) => setChainId(id);
    window.ethereum.on('accountsChanged', onAccountsChanged);
    window.ethereum.on('chainChanged', onChainChanged);
    return () => {
      window.ethereum.removeListener('accountsChanged', onAccountsChanged);
      window.ethereum.removeListener('chainChanged', onChainChanged);
    };
  }, []);

  const loadTasks = useCallback(async (addr) => {
    if (!addr || !ethers.isAddress(CONTRACT_ADDRESS) || !window.ethereum) return;
    try {
      const contract = await getContract();
      const result = await contract.getTasks(addr);
      setTasks(result.map((t, index) => ({
        index,
        name: t[0],
        deadline: Number(t[1]),
        stake: t[2],
        isCompleted: t[3],
      })));
    } catch (e) {
      console.error(e);
      setNotice({ kind: 'error', text: `Không tải được danh sách task: ${errMsg(e)}. Hãy kiểm tra ví đang ở mạng Fuji và CONTRACT_ADDRESS đúng.` });
    }
  }, []);

  useEffect(() => {
    if (onFuji) loadTasks(viewAddress);
    else setTasks([]);
  }, [viewAddress, loadTasks, onFuji]);

  const connectWallet = async () => {
    if (!window.ethereum) {
      setNotice({ kind: 'error', text: 'Không tìm thấy MetaMask. Hãy cài tiện ích MetaMask rồi tải lại trang.' });
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      await ensureFuji();
      setChainId(FUJI.chainId);
      setAccount(accounts[0]);
      setViewAddress(accounts[0]);
      setNotice(null);
    } catch (e) {
      console.error(e);
      setNotice({ kind: 'error', text: `Kết nối ví thất bại: ${errMsg(e)}` });
    }
  };

  const switchToFuji = async () => {
    try {
      await ensureFuji();
      setChainId(FUJI.chainId);
      setNotice(null);
    } catch (e) {
      console.error(e);
      setNotice({ kind: 'error', text: `Không chuyển được sang Fuji: ${errMsg(e)}. Hãy chọn mạng Avalanche Fuji thủ công trong MetaMask.` });
    }
  };

  const sendTx = async (label, action) => {
    setBusy(true);
    setNotice({ kind: 'info', text: `${label}: hãy xác nhận trong MetaMask...` });
    try {
      await ensureFuji();
      const contract = await getContract();
      const tx = await action(contract);
      setNotice({ kind: 'info', text: `${label}: đã gửi, đang chờ mạng xác nhận...` });
      await tx.wait();
      setNotice({ kind: 'ok', text: `${label}: thành công.` });
      await loadTasks(viewAddress);
      return true;
    } catch (e) {
      console.error(e);
      const text = e.code === 'ACTION_REJECTED'
        ? 'Bạn đã từ chối giao dịch trong MetaMask.'
        : `${label} thất bại: ${errMsg(e)}`;
      setNotice({ kind: 'error', text });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!account) {
      setNotice({ kind: 'error', text: 'Vui lòng kết nối ví trước.' });
      return;
    }
    if (!contractReady) {
      setNotice({ kind: 'error', text: 'Chưa điền CONTRACT_ADDRESS trong App.jsx.' });
      return;
    }

    const days = Number(deadlineDays);
    const durationSec = Math.round(days * 86400);
    if (!(days > 0) || durationSec < MIN_DEADLINE_SECONDS) {
      setNotice({ kind: 'error', text: 'Thời hạn phải là số dương và tối thiểu 1 phút (ví dụ 0.001 ngày ≈ 86 giây).' });
      return;
    }

    let valueInWei;
    try {
      valueInWei = ethers.parseEther(stakeAmount.trim());
    } catch {
      setNotice({ kind: 'error', text: 'Số AVAX cọc không hợp lệ (ví dụ: 0.1).' });
      return;
    }
    if (valueInWei <= 0n) {
      setNotice({ kind: 'error', text: 'Số AVAX cọc phải lớn hơn 0.' });
      return;
    }

    // Deadline = hiện tại (giây) + số ngày * 86400 giây
    const deadlineTimestamp = Math.floor(Date.now() / 1000) + durationSec;

    const ok = await sendTx('Tạo task', (contract) =>
      contract.createTask(taskName.trim(), deadlineTimestamp, { value: valueInWei })
    );
    if (ok) {
      setTaskName("");
      setDeadlineDays("");
      setStakeAmount("");
      setViewAddress(account);
    }
  };

  const handleComplete = (index) =>
    sendTx('Hoàn thành task', (contract) => contract.completeTask(index));

  const handlePunish = (index) =>
    sendTx('Tịch thu cọc', (contract) => contract.punishTask(viewAddress, index));

  const handleLookup = (e) => {
    e.preventDefault();
    const addr = lookupInput.trim();
    if (!ethers.isAddress(addr)) {
      setNotice({ kind: 'error', text: 'Địa chỉ ví không hợp lệ.' });
      return;
    }
    setNotice(null);
    setViewAddress(addr);
  };

  return (
    <div className="ht">
      <style>{CSS}</style>

      <header className="ht-head">
        <h1>Habit Tracker</h1>
        <p className="ht-sub">Đặt cọc AVAX cho một mục tiêu. Hoàn thành đúng hạn thì nhận lại cọc, trễ hạn thì mất cọc.</p>
      </header>

      {!contractReady && (
        <div className="ht-notice error" role="alert">
          Chưa điền CONTRACT_ADDRESS trong App.jsx. Deploy contract lên Fuji rồi dán địa chỉ 0x... vào đầu file.
        </div>
      )}

      {account && !onFuji && (
        <div className="ht-notice error" role="alert">
          MetaMask đang ở mạng khác (chain ID {chainId ? parseInt(chainId, 16) : '?'}), không phải Avalanche Fuji (43113).
          {' '}<button className="btn" onClick={switchToFuji}>Chuyển sang Fuji</button>
        </div>
      )}

      <section className="ht-wallet">
        {!account ? (
          <button className="btn primary" onClick={connectWallet}>Kết nối MetaMask</button>
        ) : (
          <p>Ví đang dùng: <b title={account}>{shorten(account)}</b> {onFuji ? '(mạng Avalanche Fuji)' : '(sai mạng)'}</p>
        )}
      </section>

      {notice && (
        <div className={`ht-notice ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
          {notice.text}
        </div>
      )}

      <section>
        <h2>Tạo mục tiêu mới</h2>
        <form onSubmit={handleCreateTask} className="ht-form">
          <label>
            Tên mục tiêu
            <input
              type="text"
              placeholder="Ví dụ: Ôn thi Hệ điều hành"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              required
            />
          </label>
          <label>
            Thời hạn (số ngày, có thể nhập số lẻ)
            <input
              type="number"
              step="any"
              min="0"
              placeholder="Ví dụ: 3"
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(e.target.value)}
              required
            />
          </label>
          <label>
            Số AVAX đặt cọc
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ví dụ: 0.1"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn primary" disabled={busy || !account}>
            Khóa cọc và tạo task
          </button>
        </form>
      </section>

      <section>
        <h2>{isOwn ? 'Task của bạn' : `Task của ${viewAddress ? shorten(viewAddress) : '...'}`}</h2>

        {!isOwn && account && (
          <p>
            <button className="btn" onClick={() => setViewAddress(account)}>Quay về task của tôi</button>
          </p>
        )}

        {tasks.length === 0 ? (
          <p className="ht-empty">
            {account ? 'Chưa có task nào. Tạo mục tiêu đầu tiên ở form phía trên.' : 'Kết nối ví để xem task.'}
          </p>
        ) : (
          <ul className="ht-list">
            {tasks.map((t) => {
              const status = statusOf(t, now);
              const remaining = t.deadline - now;
              return (
                <li key={t.index} className={`ht-task ${status}`}>
                  <div className="ht-task-top">
                    <b>{t.name}</b>
                    <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>
                  </div>
                  <p className="ht-meta">
                    Cọc: {t.stake === 0n ? '0' : ethers.formatEther(t.stake)} AVAX.
                    {' '}Hạn: {new Date(t.deadline * 1000).toLocaleString('vi-VN')}
                    {status === 'active' && ` (còn ${formatDuration(remaining)})`}
                  </p>
                  <div className="ht-actions">
                    {status === 'active' && isOwn && (
                      <button className="btn primary" disabled={busy} onClick={() => handleComplete(t.index)}>
                        Hoàn thành và nhận lại cọc
                      </button>
                    )}
                    {status === 'expired' && (
                      <button className="btn danger" disabled={busy || !account} onClick={() => handlePunish(t.index)}>
                        Tịch thu cọc
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={handleLookup} className="ht-lookup">
          <label>
            Xem task của địa chỉ khác
            <input
              type="text"
              placeholder="0x..."
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
            />
          </label>
          <button type="submit" className="btn">Xem</button>
        </form>
      </section>
    </div>
  );
}

const CSS = `
.ht { --ink:#1b2a2f; --muted:#5b6b70; --line:#d5dcd8; --bg:#f6f8f6; --accent:#0f766e; --danger:#b42318; --warn:#b54708; --ok:#067647;
  max-width: 680px; margin: 0 auto; padding: 32px 16px 64px; color: var(--ink); background: var(--bg); min-height: 100vh;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.5; box-sizing: border-box; }
.ht h1 { margin: 0 0 4px; font-size: 28px; }
.ht h2 { margin: 32px 0 12px; font-size: 18px; }
.ht-sub { margin: 0 0 20px; color: var(--muted); }
.ht-wallet { padding: 12px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); margin-bottom: 16px; }
.ht-wallet p { margin: 0; }
.ht-form, .ht-lookup { display: flex; flex-direction: column; gap: 12px; }
.ht-lookup { margin-top: 24px; }
.ht label { display: flex; flex-direction: column; gap: 4px; font-size: 14px; color: var(--muted); }
.ht input { padding: 10px; font-size: 15px; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--ink); }
.ht input:focus-visible, .ht .btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ht .btn { padding: 10px 16px; font-size: 15px; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--ink); cursor: pointer; }
.ht .btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.ht .btn.danger { background: var(--danger); border-color: var(--danger); color: #fff; }
.ht .btn:disabled { opacity: .5; cursor: not-allowed; }
.ht-notice { padding: 10px 12px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; border: 1px solid; }
.ht-notice.info { background: #eef4ff; border-color: #b2ccff; }
.ht-notice.ok { background: #ecfdf3; border-color: #abefc6; color: var(--ok); }
.ht-notice.error { background: #fef3f2; border-color: #fecdca; color: var(--danger); }
.ht-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
.ht-task { padding: 12px 14px; background: #fff; border: 1px solid var(--line); border-left-width: 4px; border-radius: 6px; }
.ht-task.active { border-left-color: var(--accent); }
.ht-task.completed { border-left-color: var(--ok); }
.ht-task.expired { border-left-color: var(--warn); }
.ht-task.slashed { border-left-color: var(--danger); }
.ht-task-top { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.ht-meta { margin: 4px 0 0; font-size: 14px; color: var(--muted); }
.ht-actions { margin-top: 10px; }
.badge { font-size: 13px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--line); }
.badge.active { color: var(--accent); } .badge.completed { color: var(--ok); }
.badge.expired { color: var(--warn); } .badge.slashed { color: var(--danger); }
.ht-empty { color: var(--muted); }
`;

export default App;