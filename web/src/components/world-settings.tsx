/**
 * World Settings Component - Settings panel for world configuration
 * 
 * Features:
 * - Chat settings configuration
 * - Notification preferences
 * - Future extensibility for additional settings
 * 
 * Implementation:
 * - Functional component using AppRun JSX
 * - Props-based state management from parent World component
 * - AppRun $ directive pattern for event handling
 * - Fieldset layout matching chat component
 * 
 * Changes:
 * - Extracted from World component for better separation of concerns
 * - Maintained original settings functionality
 * - Added proper TypeScript interfaces for props
 * - Updated to use AppRun $ directive pattern ($onchange)
 */

import { app } from 'apprun';

interface WorldSettingsProps {
  // Add settings state properties as needed
  enableNotifications?: boolean;
}

export default function WorldSettings(props: WorldSettingsProps) {
  const {
    enableNotifications = false
  } = props;

  return (
    <fieldset className="settings-fieldset">
      <legend>Settings</legend>
      <div className="chat-settings">
        <label>
          <input
            type="checkbox"
            checked={enableNotifications}
            $onchange='toggle-notifications'
          />
          Enable Notifications
        </label>
      </div>
    </fieldset>
  );
}
