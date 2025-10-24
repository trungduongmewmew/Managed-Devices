# IT Device Management

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, web-based application for managing IT network devices. This tool provides a comprehensive dashboard for device overview, detailed device tracking, network topology visualization, and robust user management.



## Features

- **Centralized Dashboard**: At-a-glance overview of all network devices with interactive charts (devices by type, location, and owner).
- **Dynamic Device Management**: Full CRUD (Create, Read, Update, Delete, Clone) functionality for all devices.
- **Customizable Data Views**: Administrators can add, rename, or delete columns in the device table to fit their specific needs.
- **Role-Based Access Control**: Pre-configured user roles (Admin, Editor, Viewer) to control permissions for different actions.
- **User Management**: Admins can easily add, delete, and manage users and their roles.
- **Network Topology**: Upload and view logical and physical network diagrams. Includes a zoom feature for detailed inspection.
- **Audit Logging**: Tracks important system events, such as device creation/deletion, user changes, and data backups/restores.
- **Backup & Restore**: Admins can create a full backup of the application data (devices, users, settings) and restore it from a JSON file.
- **Utility Link Management**: A section for managing a list of useful external or internal links.
- **Secure Authentication**: Uses JWT (JSON Web Tokens) for secure, session-based authentication.

## Tech Stack

- **Backend**: Node.js, Express.js
- **Frontend**: Vanilla JavaScript (ES6+), HTML5, Tailwind CSS
- **Database**: PostgreSQL
- **Containerization**: Docker, Docker Compose
- **Key Node.js Libraries**:
  - `pg` for PostgreSQL connection
  - `express` for the web server
  - `jsonwebtoken` for authentication
  - `bcryptjs` for password hashing
  - `multer` for file uploads
  - `cors` for resource sharing

## Getting Started

### Prerequisites

- [Docker](https://www.docker.com/get-started) and [Docker Compose](https://docs.docker.com/compose/install/) must be installed on your system.

### Installation & Running

1.  **Clone the repository:**
    ```sh
    git clone https://github.com/trungduongmewmew/Managed-Devices.git
    cd Managed-Devices
    ```

2.  **Run the application with Docker Compose:**
    This single command builds the Node.js application image, starts the Postgres database, and runs the application.
    ```sh
    docker-compose up -d
    ```

3.  **Access the application:**
    Open your web browser and navigate to `http://localhost:3000`.

4.  **Default Login:**
    - **Username**: `admin`
    - **Password**: `admin`

    > **Note:** The system requires you to change the default password upon your first login for security reasons.

## API Endpoints

The application exposes a RESTful API for all its features. All `/api` routes require a valid JWT token for access.

| Method | Endpoint                       | Description                                          | Access  |
|--------|--------------------------------|------------------------------------------------------|---------|
| POST   | `/login`                       | Authenticate a user and receive a JWT token.         | Public  |
| GET    | `/api/devices`                 | Get a list of all devices.                           | User    |
| POST   | `/api/devices`                 | Add a new device.                                    | Editor  |
| PUT    | `/api/devices/:id`             | Update an existing device.                           | Editor  |
| DELETE | `/api/devices/:id`             | Delete a device.                                     | Editor  |
| GET    | `/api/users`                   | Get a list of all users.                             | Admin   |
| POST   | `/api/users`                   | Create a new user.                                   | Admin   |
| ...    | `...`                          | And many more for columns, types, logs, etc.         | -       |

## Configuration

The application is configured using environment variables, which are set in the `docker-compose.yml` file.

- `JWT_SECRET`: A secret key for signing JWT tokens. **It is critical to change this to a long, random string in a production environment.**
- `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_HOST`, `DB_PORT`: Standard PostgreSQL connection settings.

## Contributing

Contributions are welcome! If you have suggestions for improvements or want to report a bug, please feel free to open an issue or submit a pull request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## License

This project is distributed under the MIT License. See `LICENSE` for more information.
