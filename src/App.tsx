import { useState, useEffect } from "react";
import {
  Layout,
  Card,
  Modal,
  Button,
  Badge,
  Space,
  Typography,
  theme,
  ConfigProvider,
  Dropdown,
  Tooltip,
  Alert,
  Tag,
  Progress,
  Statistic,
} from "antd";
import {
  DatabaseOutlined,
  BulbOutlined,
  BulbFilled,
  LogoutOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  DownOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  StopOutlined,
  WifiOutlined,
} from "@ant-design/icons";
import logo from "./assets/logo.png";
import LoginPage from "./LoginPage";

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

// Client interface
interface Client {
  id: string;
  hostname: string;
  ip: string;
  process_status: 'running' | 'stopped';
  cpu: number;
  ram: number;
  threads: number;
  last_update: string;
  jobs: {
    ok: number;
    fail: number;
    remaining: number;
    all: number;
  };
}

// WebSocket message types
// interface ClientsListMessage {
//   event: 'clients_list';
//   clients: Client[];
// }

// interface StatusUpdateMessage {
//   event: 'status_update';
//   client: string;
//   hostname?: string; // Optional để tương thích với server hiện tại
//   ip?: string; // Optional để tương thích với server hiện tại
//   process_status: 'running' | 'stopped';
//   cpu: number;
//   ram: number;
//   threads: number;
//   last_update: string;
//   jobs: {
//     ok: number;
//     fail: number;
//     remaining: number;
//     all: number;
//   };
// }

// interface ExportReadyMessage {
//   event: 'export_ready';
//   target: string;
//   file_url: string;
//   rows: number;
//   format: string;
// }

// Các interface này giữ nguyên theo format JSON trong mau.txt
// Chỉ sử dụng 3 events chính: clients_list, status_update, export_ready

// Session management constants
const SESSION_KEY = "brosup_session";
const THEME_KEY = "theme_mode";

// Session helper functions
const getSession = () => {
  const sessionStr = localStorage.getItem(SESSION_KEY);
  if (!sessionStr) return null;

  const session = JSON.parse(sessionStr);
  if (Date.now() > session.expiresAt) {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
  return session;
};

const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
};




// Theme helper functions
const getThemeMode = (): boolean => {
  const theme = localStorage.getItem(THEME_KEY);
  return theme === "dark";
};

const saveThemeMode = (isDark: boolean) => {
  localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
};

// function randomUser() {
//   const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
//   let result = '';
//   for (let i = 0; i < Math.floor(Math.random() * (20 - 5 + 1)) + 7; i++) {
//     result += chars.charAt(Math.floor(Math.random() * chars.length));
//   }
//   return result;
// }

function App() {
  const [isDark, setIsDark] = useState(getThemeMode());
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const borderRadiusLG = 8;
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userData, setUserData] = useState<{
    fullName: string;
    expiryDate: string;
  } | null>(null);
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    visible: boolean;
  } | null>(null);
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  // Chế độ xem: 'grid' hoặc 'table'
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Custom notification function
  const showNotification = (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
    setNotification({ type, message, visible: true });
    setTimeout(() => {
      setNotification(null);
    }, 3000);
  };

  useEffect(() => {
    const session = getSession();
    if (session) {
      setUserData(session.userData);
      setIsLoggedIn(true);
    }
  }, []);

  // WebSocket connection with auto-reconnect
  useEffect(() => {
    if (isLoggedIn && userData) {
      let reconnectAttempts = 0;
      const maxReconnectAttempts = 5;
      const reconnectInterval = 3000;
      let reconnectTimeout: number;

      const connectWebSocket = () => {
        // Initialize WebSocket connection
        const ws = new WebSocket('wss://brosup-gma.brosupdigital.com/ws/web');
        
        ws.onopen = () => {
          setIsConnected(true);
          setConnectionStatus("Connected to server");
          setWsConnection(ws);
          reconnectAttempts = 0; // Reset reconnect attempts on successful connection
          showNotification("success", "Connected to server successfully");
          
          // Yêu cầu server gửi lại clients_list để đảm bảo dữ liệu đầy đủ
          // Server sẽ tự động gửi clients_list khi kết nối thành công
          console.log('WebSocket connected, waiting for clients_list...');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Debug log để kiểm tra dữ liệu nhận được
            console.log('WebSocket received:', data);
            
            // Xử lý theo format JSON như trong mau.txt
            if (data.event === 'clients_list') {
              setClients(data.clients);
              setLoading(false);
              showNotification("info", `Received ${data.clients.length} clients`);
            } else if (data.event === 'status_update') {
              // Cập nhật realtime từng client theo format mau.txt
              // Giữ nguyên hostname và ip từ client hiện tại, chỉ update các trường status
              setClients(prev => prev.map(client => 
                client.id === data.client 
                  ? {
                      ...client, // Giữ nguyên tất cả dữ liệu cũ
                      // Chỉ update hostname, ip nếu server gửi kèm (để tránh undefined)
                      ...(data.hostname && { hostname: data.hostname }),
                      ...(data.ip && { ip: data.ip }),
                      process_status: data.process_status,
                      cpu: data.cpu,
                      ram: data.ram,
                      threads: data.threads,
                      last_update: data.last_update,
                      jobs: data.jobs
                    }
                  : client
              ));
            } else if (data.event === 'export_ready') {
              // Kết quả export theo format mau.txt
              showNotification("success", `Export ready: ${data.rows} rows - ${data.format}`);
              // Auto download file
              window.open(data.file_url, '_blank');
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          setConnectionStatus("Disconnected from server");
          setWsConnection(null);
          showNotification("warning", "Disconnected from server");
          
          // Auto-reconnect logic
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            setConnectionStatus(`Reconnecting... (${reconnectAttempts}/${maxReconnectAttempts})`);
            reconnectTimeout = setTimeout(() => {
              connectWebSocket();
            }, reconnectInterval);
          } else {
            setConnectionStatus("Failed to reconnect to server");
            showNotification("error", "Failed to reconnect to server");
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setConnectionStatus("Connection error");
          showNotification("error", "Connection error occurred");
        };

        return ws;
      };

      const ws = connectWebSocket();

      return () => {
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
        }
        if (ws) {
          ws.close();
        }
      };
    }
  }, [isLoggedIn, userData]);

  // Apply theme on mount
  useEffect(() => {
    document.body.style.backgroundColor = isDark ? "#1a1a1a" : "#ffffff";
    document.body.style.color = isDark ? "#e0e0e0" : "#000000";
  }, [isDark]);

  useEffect(() => {
    if (isLoggedIn && userData) {
      const session = getSession();
      if (!session) {
        handleLogout();
        return;
      }

      const timeLeft = session.expiresAt - Date.now();
      const logoutTimer = setTimeout(() => {
        showNotification("warning", "Session expired. Please login again.");
        handleLogout();
      }, timeLeft);

      return () => clearTimeout(logoutTimer);
    }
  }, [isLoggedIn, userData]);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    document.body.style.backgroundColor = newIsDark ? "#1a1a1a" : "#ffffff";
    document.body.style.color = newIsDark ? "#e0e0e0" : "#000000";
    saveThemeMode(newIsDark);
  };

  // Send command to server via WebSocket (theo format mau.txt)
  const sendCommand = (command: string, target: string, format?: string) => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      // Format JSON command như trong mau.txt
      const message = format 
        ? { command, target, format }  // Export command với format
        : { command, target };         // Start/Stop command
      
      wsConnection.send(JSON.stringify(message));
      showNotification("info", `Command sent: ${command} for ${target}`);
    } else {
      showNotification("error", "WebSocket connection not available");
    }
  };

  // Start client tool
  const handleStartClient = (clientId: string) => {
    sendCommand("start", clientId);
  };

  // Stop client tool
  const handleStopClient = (clientId: string) => {
    sendCommand("stop", clientId);
  };

  // Export client data
  const handleExportClient = (clientId: string, format: string = 'csv') => {
    setSelectedClient(clients.find(c => c.id === clientId) || null);
    sendCommand("export", clientId, format);
    setIsExportModalOpen(false);
  };

  const openExportModal = (client: Client) => {
    setSelectedClient(client);
    setIsExportModalOpen(true);
  };

  const closeExportModal = () => {
    setIsExportModalOpen(false);
    setSelectedClient(null);
  };

  const handleLogout = () => {
    // Close WebSocket connection
    if (wsConnection) {
      wsConnection.close();
    }
    clearSession();
    setIsLoggedIn(false);
    setUserData(null);
    setClients([]);
    setIsConnected(false);
    showNotification("success", "Logged out successfully");
  };

  const handleRefresh = () => {
    if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
      // Refresh bằng cách reconnect WebSocket để server gửi lại clients_list
      setLoading(true);
      showNotification("info", "Refreshing client list...");
      
      // Reconnect để server tự động gửi clients_list mới
      wsConnection.close();
      
      setTimeout(() => {
        setLoading(false);
      }, 2000);
    } else {
      showNotification("error", "Not connected to server");
    }
  };

  const userMenu = {
    items: [
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "Logout",
        onClick: handleLogout,
      },
    ],
  };

  const handleLogin = (userData: { fullName: string; expiryDate: string }) => {
    setUserData(userData);
    setIsLoggedIn(true);
  };

  if (!isLoggedIn) {
    return <LoginPage onLogin={handleLogin} />;
  }

  // Client Card Component
  const ClientCard = ({ client }: { client: Client }) => (
    <Card
      size="small"
      style={{
        background: isDark ? "#1a1a1a" : "#ffffff",
        border: isDark ? "1px solid #2a2a2a" : "1px solid #e2e8f0",
        borderRadius: 12,
        boxShadow: isDark 
          ? "0 2px 8px rgba(0,0,0,0.2)" 
          : "0 2px 8px rgba(0,0,0,0.05)",
        transition: "all 0.3s ease",
        cursor: "pointer",
        height: "100%",
      }}
      hoverable
      title={
        <div style={{ 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center",
          marginBottom: 0
        }}>
          <div className="flex items-center justify-center gap-2">
            <Text strong style={{ color: "#ef4444", fontSize: "16px", marginRight: 8 }}>
              {client.id}
            </Text>
              <Tag 
                color={client.process_status === 'running' ? 'success' : 'default'}
                icon={client.process_status === 'running' ? <CheckCircleOutlined /> : <StopOutlined />}
                style={{ fontSize: "11px" }}
              >
                {client.process_status.toUpperCase()}
              </Tag>
          </div>
          <Space>
            <Tooltip title={client.process_status === 'running' ? 'Stop Client' : 'Start Client'}>
              <Button
                type={client.process_status === 'running' ? 'default' : 'primary'}
                icon={client.process_status === 'running' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  client.process_status === 'running' ? handleStopClient(client.id) : handleStartClient(client.id);
                }}
                disabled={true}
                size="small"
                style={{
                  color: client.process_status === 'running' ? '#ff4d4f' : '#52c41a',
                  borderColor: client.process_status === 'running' ? '#ff4d4f' : '#52c41a'
                }}
              />
            </Tooltip>
            <Tooltip title="Export Data">
              <Button
                type="text"
                icon={<DownloadOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  openExportModal(client);
                }}
                size="small"
                disabled={true}
                style={{ color: '#1890ff' }}
              />
            </Tooltip>
          </Space>
        </div>
      }
    >
      <Space direction="vertical" size="small" style={{ width: "100%" }}>
        {/* Basic Info */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: "12px" }}>Hostname:</Text>
            <Text style={{ fontSize: "12px", fontWeight: 500 }}>{client.hostname}</Text>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: "12px" }}>IP Address:</Text>
            <Text style={{ fontSize: "12px", fontWeight: 500 }}>{client.ip}</Text>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Text type="secondary" style={{ fontSize: "12px" }}>Threads:</Text>
            <Badge count={client.threads} style={{ backgroundColor: '#108ee9' }} />
          </div>
        </div>

        {/* Resource Usage */}
        <div style={{ 
          background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
          padding: '12px',
          borderRadius: '8px',
          border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)'
        }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Text style={{ fontSize: "12px", fontWeight: 500 }}>CPU Usage</Text>
              <Text style={{ fontSize: "11px", color: client.cpu > 80 ? '#ff4d4f' : client.cpu > 60 ? '#faad14' : '#52c41a' }}>
                {client.cpu.toFixed(1)}%
              </Text>
            </div>
            <Progress 
              percent={client.cpu} 
              size="small" 
              showInfo={false}
              strokeColor={client.cpu > 80 ? '#ff4d4f' : client.cpu > 60 ? '#faad14' : '#52c41a'}
            />
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Text style={{ fontSize: "12px", fontWeight: 500 }}>RAM Usage</Text>
              <Text style={{ fontSize: "11px", color: client.ram > 80 ? '#ff4d4f' : client.ram > 60 ? '#faad14' : '#52c41a' }}>
                {client.ram.toFixed(1)}%
              </Text>
            </div>
            <Progress 
              percent={client.ram} 
              size="small" 
              showInfo={false}
              strokeColor={client.ram > 80 ? '#ff4d4f' : client.ram > 60 ? '#faad14' : '#52c41a'}
            />
          </div>
        </div>

        {/* Jobs Statistics */}
        <div style={{ 
          background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
          padding: '12px',
          borderRadius: '8px',
          border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)'
        }}>
          <Text style={{ fontSize: "12px", fontWeight: 600, marginBottom: 8, display: "block" }}>
            Job Statistics
          </Text>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '6px 12px',
            marginBottom: 8
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%', 
                backgroundColor: '#52c41a' 
              }}></div>
              <Text style={{ fontSize: '11px', color: '#52c41a', fontWeight: 500 }}>
                OK: {client.jobs.ok.toLocaleString()}
              </Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%', 
                backgroundColor: '#ff4d4f' 
              }}></div>
              <Text style={{ fontSize: '11px', color: '#ff4d4f', fontWeight: 500 }}>
                FAIL: {client.jobs.fail.toLocaleString()}
              </Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%', 
                backgroundColor: '#faad14' 
              }}></div>
              <Text style={{ fontSize: '11px', color: '#faad14', fontWeight: 500 }}>
                PENDING: {client.jobs.remaining.toLocaleString()}
              </Text>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{ 
                width: '6px', 
                height: '6px', 
                borderRadius: '50%', 
                backgroundColor: '#1890ff' 
              }}></div>
              <Text style={{ fontSize: '11px', color: '#1890ff', fontWeight: 600 }}>
                ALL: {client.jobs.all.toLocaleString()}
              </Text>
            </div>
          </div>
          {/* Progress bar for completion */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Text style={{ fontSize: "11px", fontWeight: 500 }}>Progress</Text>
              <Text style={{ fontSize: "11px" }}>
                {client.jobs.all > 0 ? Math.round(((client.jobs.ok + client.jobs.fail) / client.jobs.all) * 100) : 0}%
              </Text>
            </div>
            <Progress 
              percent={client.jobs.all > 0 ? Math.round(((client.jobs.ok + client.jobs.fail) / client.jobs.all) * 100) : 0}
              size="small"
              showInfo={false}
              strokeColor={{
                '0%': '#52c41a',
                '50%': '#faad14', 
                '100%': client.jobs.fail > 0 ? '#ff4d4f' : '#52c41a'
              }}
            />
          </div>
        </div>

        {/* Last Update */}
        <div style={{ textAlign: "center", paddingTop: 4 }}>
          <Text type="secondary" style={{ fontSize: '11px' }}>
            Updated: {new Date(client.last_update).toLocaleString("vi-VN", { 
              hour12: false,
              month: "2-digit",
              day: "2-digit", 
              hour: "2-digit",
              minute: "2-digit"
            })}
          </Text>
        </div>
      </Space>
    </Card>
  );

  const sortedClients = [...clients].sort((a, b) => {
  const normalize = (str: string) => str.toLowerCase().replace(/[_\-\s]/g, ""); 


  const regex = /(.*?)(\d+)?$/;

  const matchA = a.id.match(regex);
  const matchB = b.id.match(regex);

  const baseA = matchA ? normalize(matchA[1]) : normalize(a.id);
  const baseB = matchB ? normalize(matchB[1]) : normalize(b.id);

  if (baseA < baseB) return -1;
  if (baseA > baseB) return 1;

  // Nếu base giống nhau thì so số
  const numA = matchA && matchA[2] ? parseInt(matchA[2], 10) : 0;
  const numB = matchB && matchB[2] ? parseInt(matchB[2], 10) : 0;
  return numA - numB;
});


  return (
    <ConfigProvider
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: "#ef4444",
          colorError: "#ef4444",
          borderRadius: borderRadiusLG,
        },
      }}
    >
      {notification && notification.visible && (
        <div style={{ position: 'fixed', top: 24, left: 0, right: 0, zIndex: 2000, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <Alert
            message={notification.message}
            type={notification.type}
            showIcon
            closable
            style={{ minWidth: 320, maxWidth: 480, pointerEvents: 'auto' }}
            onClose={() => setNotification(null)}
          />
        </div>
      )}
      <Layout
        style={{
          minHeight: "100vh",
          background: isDark ? "#0f0f0f" : "#f8fafc",
        }}
      >
        <Header
          style={{
            padding: "0 24px",
            background: isDark ? "#1a1a1a" : "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: isDark
              ? "0 4px 20px rgba(0,0,0,0.4)"
              : "0 4px 20px rgba(0,0,0,0.08)",
            borderBottom: isDark ? "1px solid #2a2a2a" : "1px solid #e2e8f0",
            backdropFilter: "blur(10px)",
            position: "sticky",
            top: 0,
            zIndex: 1000,
          }}
        >
          <Space>
            <img
              src={logo}
              alt="Logo"
              className="app-logo"
              style={{ height: "42px", width: "42px" }}
            />
            <Title
              level={2}
              style={{ 
                margin: 0, 
                color: isDark ? "#f8fafc" : "#0f0f0f", 
                fontSize: "20px",
                fontWeight: 700,
                letterSpacing: "-0.5px"
              }}
            >
              GManager - Monitor
            </Title>
          </Space>
          <Space>
            <Badge
              color={isConnected ? "#52c41a" : "#ff4d4f"}
            >
              <Button
                type="text"
                icon={<WifiOutlined style={{ color: isConnected ? "#52c41a" : "#ff4d4f" }} />}
                size="large"
              >
                {isConnected ? "Connected" : "Disconnected"}
              </Button>
            </Badge>
            <Button
              type="text"
              icon={
                isDark ? (
                  <BulbFilled style={{ color: "#ef4444" }} />
                ) : (
                  <BulbOutlined style={{ color: "#ef4444" }} />
                )
              }
              onClick={toggleTheme}
              size="large"
              style={{ color: "#ef4444" }}
            />
            <Space style={{ alignItems: "center" }}>
              <Dropdown menu={userMenu} placement="bottomRight">
                <Button
                  type="text"
                  style={{
                    paddingRight: "0px",
                    paddingLeft: "0px",
                    display: "flex",
                    alignItems: "center",
                    color: isDark ? "#e0e0e0" : "#000000",
                  }}
                >
                  <Text
                    style={{
                      color: isDark ? "#e0e0e0" : "#000000",
                      fontSize: "14px",
                    }}
                  >
                    {userData?.fullName || "User"}
                  </Text>
                  <DownOutlined />
                </Button>
              </Dropdown>
            </Space>
          </Space>
        </Header>

        <Content
          style={{
            padding: "24px",
            background: isDark ? "#0f0f0f" : "#f8fafc",
          }}
        >
          <div style={{ maxWidth: 1400, margin: "0 auto" }}>
            {/* Connection Status */}
            {connectionStatus && (
              <Alert
                message={connectionStatus}
                type={isConnected ? "success" : "error"}
                showIcon
                style={{ marginBottom: 16 }}
                closable
                onClose={() => setConnectionStatus(null)}
              />
            )}

            {/* Statistics Cards */}
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
              gap: "16px", 
              marginBottom: "24px" 
            }}>
              <Card size="small" style={{
                background: isDark ? "#1a1a1a" : "#ffffff",
                border: isDark ? "1px solid #2a2a2a" : "1px solid #e2e8f0",
              }}>
                <Statistic
                  title="Total Clients"
                  value={clients.length}
                  valueStyle={{ color: "#ef4444" }}
                  prefix={<DatabaseOutlined />}
                />
              </Card>
              <Card size="small" style={{
                background: isDark ? "#1a1a1a" : "#ffffff",
                border: isDark ? "1px solid #2a2a2a" : "1px solid #e2e8f0",
              }}>
                <Statistic
                  title="Running"
                  value={clients.filter(c => c.process_status === 'running').length}
                  valueStyle={{ color: "#52c41a" }}
                  prefix={<PlayCircleOutlined />}
                />
              </Card>
              <Card size="small" style={{
                background: isDark ? "#1a1a1a" : "#ffffff",
                border: isDark ? "1px solid #2a2a2a" : "1px solid #e2e8f0",
              }}>
                <Statistic
                  title="Stopped"
                  value={clients.filter(c => c.process_status === 'stopped').length}
                  valueStyle={{ color: "#ff4d4f" }}
                  prefix={<PauseCircleOutlined />}
                />
              </Card>
              <Card size="small" style={{
                background: isDark ? "#1a1a1a" : "#ffffff",
                border: isDark ? "1px solid #2a2a2a" : "1px solid #e2e8f0",
              }}>
                <Statistic
                  title="Total Jobs"
                  value={clients.reduce((sum, c) => sum + c.jobs.all, 0)}
                  valueStyle={{ color: "#1890ff" }}
                  prefix={<CheckCircleOutlined />}
                />
              </Card>
            </div>

            {/* Client Management View Mode Switch + Table/Grid */}
            <div>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
                padding: "16px 0"
              }}>
                <Space>
                  <DatabaseOutlined style={{ color: "#ef4444", fontSize: "20px" }} />
                  <Title level={4} style={{ 
                    margin: 0,
                    color: isDark ? "#e0e0e0" : "#000000",
                    fontSize: "18px",
                    fontWeight: 600
                  }}>
                    Client Management ({clients.length})
                  </Title>
                </Space>
                <Space>
                  <Button
                    icon={<ReloadOutlined />}
                    onClick={handleRefresh}
                    loading={loading}
                    style={{ 
                      color: "#ef4444", 
                      borderColor: "#ef4444"
                    }}
                  >
                    Refresh
                  </Button>
                  <Button
                    type={viewMode === 'grid' ? 'default' : 'primary'}
                    onClick={() => setViewMode(viewMode === 'grid' ? 'table' : 'grid')}
                    style={{ marginLeft: 8 }}
                  >
                    {viewMode === 'grid' ? 'View Table' : 'View Cards'}
                  </Button>
                </Space>
              </div>
              {/* Loading, Empty, Table, Grid */}
              {loading ? (
                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", 
                  gap: "16px" 
                }}>
                  {[...Array(6)].map((_, index) => (
                    <Card
                      key={index}
                      loading={true}
                      style={{
                        background: isDark ? "#1a1a1a" : "#ffffff",
                        border: isDark ? "1px solid #2a2a2a" : "1px solid #e2e8f0",
                        borderRadius: 12,
                      }}
                    >
                      <div style={{ height: 200 }}></div>
                    </Card>
                  ))}
                </div>
              ) : clients.length === 0 ? (
                <Card
                  style={{
                    background: isDark ? "#1a1a1a" : "#ffffff",
                    border: isDark ? "1px solid #2a2a2a" : "1px solid #e2e8f0",
                    borderRadius: 12,
                    textAlign: "center",
                    padding: "40px 20px"
                  }}
                >
                  <div style={{ color: isDark ? "#666666" : "#999999" }}>
                    <DatabaseOutlined style={{ fontSize: "48px", marginBottom: 16 }} />
                    <div style={{ fontSize: "16px", marginBottom: 8 }}>
                      {isConnected ? "No clients connected" : "Not connected to server"}
                    </div>
                    <Text type="secondary">
                      {isConnected ? "Waiting for clients to connect..." : "Please check your connection"}
                    </Text>
                  </div>
                </Card>
              ) : viewMode === 'table' ? (
                <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'separate',
                    borderSpacing: 0,
                    background: isDark ? '#1a1a1a' : '#fff',
                    borderRadius: 8,
                    boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 8px rgba(0,0,0,0.05)',
                    border: isDark ? '1px solid #444' : '1px solid #e2e8f0',
                    overflow: 'hidden'
                  }}>
                    <thead>
                      <tr style={{ background: isDark ? '#222' : '#f5f5f5', color: isDark ? '#e0e0e0' : '#333' }}>
                        <th style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0', fontWeight: 600 }}>ID</th>
                        <th style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0', fontWeight: 600 }}>Hostname</th>
                        <th style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0', fontWeight: 600 }}>IP</th>
                        <th style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0', fontWeight: 600 }}>Status</th>
                        <th style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0', fontWeight: 600 }}>CPU (%)</th>
                        <th style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0', fontWeight: 600 }}>RAM (%)</th>
                        <th style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0', fontWeight: 600 }}>Threads</th>
                        <th style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0', fontWeight: 600 }}>Jobs (OK/Fail/Pending/All)</th>
                        <th style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0', fontWeight: 600 }}>Last Update</th>
                        <th style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0', fontWeight: 600 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedClients.map(client => {
                        const percent = client.jobs.all > 0 ? Math.round(((client.jobs.ok + client.jobs.fail) / client.jobs.all) * 100) : 0;
                        return (
                          <tr key={client.id} style={{ borderBottom: isDark ? '1px solid #444' : '1px solid #e2e8f0', color: isDark ? '#e0e0e0' : '#333', textAlign: 'center' }}>
                            <td style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0', fontWeight: 500 }}>{client.id}</td>
                            <td style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0' }}>{client.hostname}</td>
                            <td style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0' }}>{client.ip}</td>
                            <td style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0' }}>
                              <Tag color={client.process_status === 'running' ? 'success' : 'default'}>
                                {client.process_status.toUpperCase()}
                              </Tag>
                            </td>
                            <td style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0' }}>{client.cpu.toFixed(1)}</td>
                            <td style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0' }}>{client.ram.toFixed(1)}</td>
                            <td style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0' }}>{client.threads}</td>
                            <td style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0' }}>
                              <span style={{ color: '#52c41a', fontWeight: 500 }}>{client.jobs.ok}</span> /
                              <span style={{ color: '#ff4d4f', fontWeight: 500 }}>{client.jobs.fail}</span> /
                              <span style={{ color: '#faad14', fontWeight: 500 }}>{client.jobs.remaining}</span> /
                              <span style={{ color: '#1890ff', fontWeight: 600 }}>{client.jobs.all}</span>
                              <br />
                              <span style={{ fontSize: '11px', color: percent > 80 ? '#ff4d4f' : percent > 60 ? '#faad14' : '#52c41a', fontWeight: 500 }}>
                                Progress: {percent}% 
                              </span>
                            </td>
                            <td style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0', fontSize: '12px' }}>
                              {new Date(client.last_update).toLocaleString("vi-VN", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td style={{ padding: '8px', border: isDark ? '1px solid #444' : '1px solid #e2e8f0' }}>
                              <Space>
                                <Tooltip title={client.process_status === 'running' ? 'Stop Client' : 'Start Client'}>
                                  <Button
                                    type={client.process_status === 'running' ? 'default' : 'primary'}
                                    icon={client.process_status === 'running' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                                    onClick={() => {}}
                                    disabled={true}
                                    size="small"
                                    style={{
                                      color: client.process_status === 'running' ? '#ff4d4f' : '#52c41a',
                                      borderColor: client.process_status === 'running' ? '#ff4d4f' : '#52c41a'
                                    }}
                                  />
                                </Tooltip>
                                <Tooltip title="Export Data">
                                  <Button
                                    type="text"
                                    icon={<DownloadOutlined />}
                                    onClick={() => {}}
                                    size="small"
                                    disabled={true}
                                    style={{ color: '#1890ff' }}
                                  />
                                </Tooltip>
                              </Space>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ 
                  display: "grid", 
                  gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", 
                  gap: "16px",
                  gridAutoRows: "max-content"
                }}>
                  {sortedClients.map((client) => (
                    <ClientCard key={client.id} client={client} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </Content>
         {/* Footer */}
        <Footer
          style={{
            textAlign: "center",
            background: isDark ? "#1a1a1a" : "#ffffff",
            borderTop: isDark ? "1px solid #2a2a2a" : "1px solid #e2e8f0",
            color: isDark ? "#a0a0a0" : "#666666",
            padding: "24px",
            marginTop: "auto",
          }}
        >
          <div style={{ maxWidth: 1400, margin: "0 auto" }}>
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
              <Text
                type="secondary"
                style={{
                  color: isDark ? "#a0a0a0" : "#666666",
                  fontSize: "12px",
                }}
              >
                © 2025 Brosup Digital Co., Ltd. All rights reserved.
              </Text>
              {/* <div>
                <ClockCircleOutlined
                  style={{
                    fontSize: 10,
                    color: isDark ? "#a0a0a0" : "#666666",
                    marginRight: 4,
                  }}
                />
                <Text
                  type="secondary"
                  style={{
                    fontSize: 12,
                    color: isDark ? "#a0a0a0" : "#666666",
                  }}
                >
                  Key expires in:{" "}
                  {userData?.expiryDate
                    ? new Date(userData.expiryDate).toLocaleDateString(
                        "en-US",
                        {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        }
                      )
                    : "Unknown"}
                </Text>
              </div> */}
            </Space>
          </div>
        </Footer>

        {/* Export Modal */}
        <Modal
          title={
            <Space>
              <DownloadOutlined style={{ color: "#ef4444" }} />
              <span style={{ color: isDark ? "#e0e0e0" : "#000000" }}>
                Export Client Data
              </span>
            </Space>
          }
          open={isExportModalOpen}
          onCancel={closeExportModal}
          footer={[
            <Button key="cancel" onClick={closeExportModal}>
              Cancel
            </Button>,
            <Button 
              key="csv" 
              type="primary" 
              onClick={() => handleExportClient(selectedClient?.id || '', 'csv')}
              style={{ background: "#ef4444", borderColor: "#ef4444" }}
            >
              Export CSV
            </Button>,
            <Button 
              key="txt" 
              onClick={() => handleExportClient(selectedClient?.id || '', 'txt')}
              style={{ color: "#ef4444", borderColor: "#ef4444" }}
            >
              Export TXT
            </Button>,
          ]}
        >
          {selectedClient && (
            <div style={{ color: isDark ? "#e0e0e0" : "#000000" }}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <div>
                  <Text strong>Client ID: </Text>
                  <Text>{selectedClient.id}</Text>
                </div>
                <div>
                  <Text strong>Hostname: </Text>
                  <Text>{selectedClient.hostname}</Text>
                </div>
                <div>
                  <Text strong>IP Address: </Text>
                  <Text>{selectedClient.ip}</Text>
                </div>
                <div>
                  <Text strong>Total Jobs: </Text>
                  <Text>{selectedClient.jobs.all}</Text>
                </div>
                <Alert
                  message="Export Information"
                  description="This will export all job data and statistics for this client. The file will be downloaded automatically when ready."
                  type="info"
                  showIcon
                  style={{ marginTop: 16 }}
                />
              </Space>
            </div>
          )}
        </Modal>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
