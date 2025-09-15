import React from 'react';
import { WaslaLogo } from './WaslaLogo';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

export const LogoShowcase: React.FC = () => {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-3xl font-bold text-center mb-8">Wasla Logo Showcase</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Small Logo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Small Logo (24px)</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-center py-8">
            <WaslaLogo size={24} />
          </CardContent>
        </Card>

        {/* Medium Logo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Medium Logo (48px)</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-center py-8">
            <WaslaLogo size={48} />
          </CardContent>
        </Card>

        {/* Large Logo */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Large Logo (72px)</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-center py-8">
            <WaslaLogo size={72} />
          </CardContent>
        </Card>

        {/* Logo with Text (Small) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Logo + Text (Small)</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-center py-8">
            <WaslaLogo size={32} showText={true} textSize="sm" />
          </CardContent>
        </Card>

        {/* Logo with Text (Medium) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Logo + Text (Medium)</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-center py-8">
            <WaslaLogo size={48} showText={true} textSize="md" />
          </CardContent>
        </Card>

        {/* Logo with Text (Large) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Logo + Text (Large)</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center items-center py-8">
            <WaslaLogo size={64} showText={true} textSize="lg" />
          </CardContent>
        </Card>

      </div>

      {/* Usage Examples */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Usage Examples</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            
            {/* Header Example */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Header Example</h3>
              <div className="flex items-center justify-between bg-white p-4 rounded border">
                <WaslaLogo size={40} showText={true} textSize="md" />
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Station Portal</span>
                </div>
              </div>
            </div>

            {/* Card Header Example */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Card Header Example</h3>
              <Card>
                <CardHeader className="flex flex-row items-center gap-3">
                  <WaslaLogo size={32} />
                  <div>
                    <CardTitle>Wasla Transportation</CardTitle>
                    <p className="text-sm text-muted-foreground">Tunisia's Digital Transport Network</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <p>Your content goes here...</p>
                </CardContent>
              </Card>
            </div>

            {/* Loading Screen Example */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <h3 className="text-sm font-medium text-gray-600 mb-2">Loading Screen Example</h3>
              <div className="bg-white p-8 rounded border text-center">
                <WaslaLogo size={80} className="mb-4" />
                <h2 className="text-xl font-semibold mb-2">Wasla</h2>
                <p className="text-gray-600 text-sm">Tunisia Transportation Management</p>
                <div className="mt-4 flex justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      {/* Code Examples */}
      <Card>
        <CardHeader>
          <CardTitle>Code Examples</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-medium mb-2">Basic Logo:</h4>
              <code className="bg-gray-100 p-2 rounded block">
                {`<WaslaLogo size={48} />`}
              </code>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Logo with Text:</h4>
              <code className="bg-gray-100 p-2 rounded block">
                {`<WaslaLogo size={48} showText={true} textSize="md" />`}
              </code>
            </div>
            
            <div>
              <h4 className="font-medium mb-2">Logo with Custom Classes:</h4>
              <code className="bg-gray-100 p-2 rounded block">
                {`<WaslaLogo size={32} className="drop-shadow-lg" />`}
              </code>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
};