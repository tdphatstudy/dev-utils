/** A complete FE example. Rules run from top to bottom; the final response is the fallback. */
export const MOCK_EXAMPLE_YAML = `version: 1
name: Frontend user API
port: 4010
cors:
  enabled: true
  origins:
    - http://localhost:*
    - http://127.0.0.1:*
endpoints:
  - id: list-users
    name: List users
    method: GET
    path: /api/users
    responses:
      - id: unauthorized
        name: Missing Authorization
        when:
          all:
            - source: header
              key: Authorization
              operator: missing
        status: 401
        body:
          error: Authorization header is required
      - id: admins
        name: Filter admins
        when:
          all:
            - source: query
              key: role
              operator: equals
              value: admin
        status: 200
        headers:
          X-Mock-Rule: admins
        delayMs: 150
        body:
          users:
            - id: 1
              name: Alex
              role: admin
          total: 1
      - id: empty-page
        name: No users after page 3
        when:
          all:
            - source: query
              key: page
              operator: gt
              value: 3
        status: 200
        body:
          users: []
          total: 0
      - id: list-default
        name: All users (fallback)
        status: 200
        body:
          users:
            - id: 1
              name: Alex
              role: admin
            - id: 2
              name: Sam
              role: user
          total: 2
  - id: create-user
    name: Create user
    method: POST
    path: /api/users
    responses:
      - id: missing-name
        name: Missing name
        when:
          all:
            - source: body
              key: /name
              operator: missing
        status: 422
        body:
          error: name is required
      - id: created
        name: Created (fallback)
        status: 201
        body:
          id: 3
          name: New user
`
