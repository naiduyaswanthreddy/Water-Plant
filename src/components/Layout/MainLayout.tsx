import { Outlet, Link, useLocation } from 'react-router-dom';
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { 
  Droplets,
  Users,
  Package,
  Truck,
  ShoppingCart,
  BarChart3,
  Settings,
  Calendar,
  DollarSign,
  LogOut,
  MoreHorizontal
} from 'lucide-react';

const MainLayout = () => {
  const { signOut } = useAuth();
  const location = useLocation();

  const navigation = [
    // 1. Dashboard
    { name: 'Dashboard', href: '/', icon: BarChart3 },
    // 2. Delivery
    { name: 'Delivery', href: '/delivery', icon: Truck },
    // 3. Shop
    { name: 'Shop', href: '/shop', icon: ShoppingCart },
    // 4. Function Orders
    { name: 'Function Orders', href: '/function-orders', icon: Calendar },
    // Continue with the rest in original relative order
    { name: 'Customers', href: '/customers', icon: Users },
    { name: 'Bottles', href: '/bottles', icon: Package },
    { name: 'Transactions', href: '/transactions', icon: ShoppingCart },
    { name: 'Pricing', href: '/pricing', icon: DollarSign },
    { name: 'Reports', href: '/reports', icon: BarChart3 },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const bottomNav = [
    { name: 'Delivery', href: '/delivery', icon: Truck },
    { name: 'Shop', href: '/shop', icon: ShoppingCart },
    { name: 'Customers', href: '/customers', icon: Users },
    { name: 'Bottles', href: '/bottles', icon: Package },
  ];

  // Remaining navigation items to show under "More"
  const remainingNav = navigation.filter(
    (item) => !bottomNav.some((bn) => bn.href === item.href)
  );

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* No hamburger on mobile; access pages via bottom More menu */}
      <div className="hidden" />

      {/* Sidebar (hidden off-canvas on mobile, visible on lg via tailwind) */}
      <div className={`fixed inset-y-0 left-0 z-40 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0 -translate-x-full`}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-2 p-6 border-b">
            <div className="p-2 rounded-lg bg-primary text-primary-foreground">
              <Droplets className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Sri Venkateswara Water Plant</h1>
              <p className="text-sm text-muted-foreground">Water Management</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4">
            <ul className="space-y-2">
              {navigation.map((item) => {
                const isActive = location.pathname === item.href;
                const Icon = item.icon;
                
                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        isActive 
                          ? 'bg-primary text-primary-foreground' 
                          : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {item.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Sign out */}
          <div className="p-4 border-t">
            <Button
              variant="ghost"
              onClick={handleSignOut}
              className="w-full justify-start"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </div>

      {/* No mobile overlay since there is no hamburger menu */}

      {/* Main content */}
      <div className="lg:ml-64">
        <main className="p-4 lg:p-6 pb-24 lg:pb-6">
          <Outlet />
        </main>
      </div>

      {/* Bottom mobile nav with More menu */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <ul className="grid grid-cols-5">
          {bottomNav.map((item) => {
            const isActive = location.pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.name}>
                <Link
                  to={item.href}
                  className={`flex flex-col items-center justify-center gap-1 py-2 text-xs ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? '' : ''}`} />
                  <span>{item.name}</span>
                </Link>
              </li>
            );
          })}
          {/* More menu trigger */}
          <li>
            <Sheet>
              <SheetTrigger asChild>
                <button className="w-full flex flex-col items-center justify-center gap-1 py-2 text-xs text-muted-foreground">
                  <MoreHorizontal className="h-5 w-5" />
                  <span>More</span>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="pb-8">
                <SheetHeader>
                  <SheetTitle>More</SheetTitle>
                </SheetHeader>
                <nav className="mt-4">
                  <ul className="grid grid-cols-2 gap-2">
                    {remainingNav.map((item) => {
                      const Icon = item.icon;
                      const isActive = location.pathname === item.href;
                      return (
                        <li key={item.name}>
                          <SheetClose asChild>
                            <Link
                              to={item.href}
                              className={`flex items-center gap-3 px-3 py-2 rounded-md border ${
                                isActive ? 'border-primary text-primary' : 'border-transparent text-foreground hover:border-accent hover:bg-accent'
                              }`}
                            >
                              <Icon className="h-5 w-5" />
                              <span>{item.name}</span>
                            </Link>
                          </SheetClose>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              </SheetContent>
            </Sheet>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default MainLayout;