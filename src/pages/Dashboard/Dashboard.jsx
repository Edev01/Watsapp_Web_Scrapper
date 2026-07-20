import { useNavigate } from 'react-router-dom'
import AdminDashboard from './AdminDashboard/AdminDashboard'
import UserDashboard from './UserDashboard/UserDashboard'

const Dashboard = ({ user, onSignOut, setToast }) => {
  const navigate = useNavigate()

  const handleSignOut = () => {
    onSignOut()
    navigate('/signin')
  }

  // Role check: admin email or role field
  const isAdmin = user?.role === 'admin' || user?.email === 'se.zeeshanhaider@gmail.com'

  if (isAdmin) {
    return <AdminDashboard user={user} onSignOut={handleSignOut} setToast={setToast} />
  }

  return <UserDashboard user={user} onSignOut={handleSignOut} />
}

export default Dashboard
